import { MAX_IMAGE_BYTES, validateImageFile, type ApiError } from '@counterfeitiq/shared';
import type { VisionModel } from '../../api/src/ai/extraction';
import type { RateLimiter } from '../../api/src/adapters/greenbook';
import { AnalysisApiError, apiErrorResponse } from '../../api/src/routes/errors';
import { comparePackaging } from './compare';
import { comparePackagingWithErp } from './erp/compare';
import { createHttpConnector } from './erp/http-connector';
import { parseIdentifier } from './erp/identifiers';
import { resolveIdentifier } from './erp/resolve';
import { durableScanStore, type ScanStore } from './erp/scan-store';
import { connectorFor, notAttempted, type ErpConnector } from './erp/types';
import { compareErpRequestSchema, compareRequestSchema, matchRequestSchema, NOTICE, resolveRequestSchema, type ServiceErrorCode } from './contract';
import { extractPackaging } from './extract';
import { matchProduct } from './match';
import { workersAiProvider, type VisionProvider } from './provider';
import { createSource, type ReferenceSource, type SourceOptions } from './sources';
import { createDemoSource } from './sources/demo';

export interface Env {
  ENVIRONMENT?: string;
  AI?: VisionModel;
  GEMMA_MODEL?: string;
  AI_SERVICE_TOKEN?: string;
  REFERENCE_MODE?: string;
  GREENBOOK_ACCESS_BASIS?: string;
  GREENBOOK_LIMITER?: RateLimiter;
  EXTRACT_LIMITER?: RateLimiter;
  REFERENCE_LIMITER?: RateLimiter;
  /** "demo" or "manufacturer_api". Anything else connects nothing. */
  ERP_MODE?: string;
  ERP_BASE_URL?: string;
  ERP_API_TOKEN?: string;
  ERP_SOURCE_NAME?: string;
  /** Optional service binding, for Workers on one account. */
  ERP_SERVICE?: { fetch: typeof fetch };
  SCAN_HISTORY?: Parameters<typeof durableScanStore>[0];
}

/** Replaced in tests, so no test reaches a model or a registry. */
export interface Overrides {
  provider?: VisionProvider;
  source?: SourceOptions;
  erpFetch?: typeof fetch;
  scans?: ScanStore;
  now?: () => Date;
}

const MAX_MULTIPART_BYTES = MAX_IMAGE_BYTES + 256 * 1024;
const MAX_JSON_BYTES = 64 * 1024;

function serviceError(code: ServiceErrorCode, message: string, status: number): Response {
  return Response.json({ error: { code, message, retryable: false } }, { status });
}

const tooLarge = () => apiErrorResponse({ code: 'FILE_TOO_LARGE', message: 'Choose an image no larger than 4 MiB.', retryable: false });

async function sha256(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

/** Hashes first, so the comparison time reveals nothing about the token. */
async function authorized(request: Request, token: string): Promise<boolean> {
  const given = await sha256(request.headers.get('Authorization') ?? '');
  const expected = await sha256(`Bearer ${token}`);
  return given.reduce((difference, byte, index) => difference | (byte ^ (expected[index] ?? 0)), 0) === 0;
}

/** Reads at most maxBytes, so a body with no Content-Length cannot exhaust memory. */
async function readBounded(request: Request, maxBytes: number): Promise<Uint8Array<ArrayBuffer> | null> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

async function readJson(request: Request): Promise<{ body: unknown } | { failure: Response }> {
  const bytes = await readBounded(request, MAX_JSON_BYTES);
  if (!bytes) return { failure: serviceError('INVALID_REQUEST', 'The request body is too large.', 413) };
  try {
    return { body: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return { failure: serviceError('INVALID_REQUEST', 'The request body must be JSON.', 400) };
  }
}

async function extractRoute(request: Request, env: Env, overrides: Overrides): Promise<Response> {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
    return apiErrorResponse({ code: 'INVALID_FILE_TYPE', message: 'Submit a JPEG, PNG or WebP image as multipart form field "image".', retryable: false });
  }
  const bytes = await readBounded(request, MAX_MULTIPART_BYTES);
  if (!bytes) return tooLarge();

  const unreadable = (message: string): ApiError => ({ code: 'UNREADABLE_IMAGE', message, retryable: false });
  let image: FormDataEntryValue | null;
  try {
    image = (await new Response(bytes, { headers: { 'content-type': contentType } }).formData()).get('image');
  } catch {
    return apiErrorResponse(unreadable('The uploaded image could not be read.'));
  }
  if (!(image instanceof File)) return apiErrorResponse(unreadable('The image field is missing or unreadable.'));
  if (image.size === 0) return apiErrorResponse(unreadable('The uploaded image is empty.'));
  const invalid = validateImageFile(image);
  if (invalid) return apiErrorResponse(invalid);

  const provider = overrides.provider ?? (env.AI && env.GEMMA_MODEL ? workersAiProvider(env.AI, env.GEMMA_MODEL) : null);
  if (!provider) {
    // Never mock extraction: a product the photo does not show must not be reported.
    return apiErrorResponse({ code: 'SERVICE_UNAVAILABLE', message: 'Image analysis is not configured.', retryable: false });
  }

  const started = Date.now();
  const extraction = await extractPackaging(image, provider);
  return Response.json({
    extraction,
    inference: { provider: provider.name, model: provider.model, latencyMs: Date.now() - started },
    notice: NOTICE,
  });
}

async function withinLimit(limiter: RateLimiter | undefined): Promise<boolean> {
  if (!limiter) return true;
  try {
    // The only caller is the authenticated backend, so there is a single key.
    return (await limiter.limit({ key: 'backend' })).success;
  } catch {
    return true;
  }
}

function rateLimited(): Response {
  const response = apiErrorResponse({ code: 'RATE_LIMITED', message: 'Too many requests. Please try again in a minute.', retryable: true });
  response.headers.set('Retry-After', '60');
  return response;
}

function createConnectors(env: Env, overrides: Overrides): ErpConnector[] {
  const mode = env.ERP_MODE?.trim().toLowerCase();
  if ((mode !== 'demo' && mode !== 'manufacturer_api') || !env.ERP_BASE_URL || !env.ERP_API_TOKEN) return [];
  const service = env.ERP_SERVICE;
  return [createHttpConnector({
    sourceName: env.ERP_SOURCE_NAME || (mode === 'demo' ? 'CounterfeitIQ simulated ERP (fictional)' : 'Manufacturer API'),
    sourceType: mode === 'demo' ? 'SIMULATED_ERP' : 'MANUFACTURER_API',
    baseUrl: env.ERP_BASE_URL,
    token: env.ERP_API_TOKEN,
    fetch: overrides.erpFetch ?? (service ? (input, init) => service.fetch(input, init) : undefined),
    now: overrides.now,
  })];
}

const ERP_ROUTE = /^\/(?:resolve-identifier|source-status|compare-packaging\/erp|products\/[^/]+(?:\/(?:batches|packs)\/[^/]+)?)$/;

async function erpRoute(request: Request, pathname: string, env: Env, overrides: Overrides, reference: () => ReferenceSource): Promise<Response> {
  const connectors = createConnectors(env, overrides);
  const invalid = () => serviceError('INVALID_REQUEST', 'The request does not match the contract.', 400);
  const expected = pathname === '/resolve-identifier' || pathname === '/compare-packaging/erp' ? 'POST' : 'GET';
  if (request.method !== expected) return new Response(null, { status: 405, headers: { Allow: expected } });

  if (expected === 'POST') {
    const json = await readJson(request);
    if ('failure' in json) return json.failure;
    if (pathname === '/compare-packaging/erp') {
      const parsed = compareErpRequestSchema.safeParse(json.body);
      if (!parsed.success) return invalid();
      return Response.json(await comparePackagingWithErp(parsed.data.extraction, parsed.data.identifier, connectors));
    }
    const parsed = resolveRequestSchema.safeParse(json.body);
    if (!parsed.success) return invalid();
    return Response.json(await resolveIdentifier(parsed.data.identifier, {
      connectors,
      // Simulated products never reach a live registry, because their numbers are fictional.
      referenceFor: (connector) => (connector.sourceType === 'SIMULATED_ERP' ? createDemoSource(overrides.now) : reference()),
      scans: overrides.scans ?? (env.SCAN_HISTORY ? durableScanStore(env.SCAN_HISTORY) : null),
      deviceId: parsed.data.deviceId,
      now: overrides.now,
    }));
  }

  if (pathname === '/source-status') {
    const statuses = await Promise.all(connectors.map((connector) => connector.getSourceStatus()));
    return Response.json({
      sources: statuses.length ? statuses : [{ available: false, capabilities: { batches: false, packs: false }, provenance: notAttempted('No connected source') }],
    });
  }

  const [, , rawGtin, child, rawKey] = pathname.split('/');
  let key: string | null = null;
  try {
    key = rawKey ? decodeURIComponent(rawKey) : null;
  } catch {
    return invalid();
  }
  const gtin = parseIdentifier(rawGtin ?? '')?.gtin;
  if (!gtin) return invalid();
  const connector = connectorFor(connectors, gtin);
  if (!connector) return Response.json({ status: 'SOURCE_UNAVAILABLE', data: null, provenance: notAttempted('No connected source') });
  if (child === 'batches' && key) return Response.json(await connector.getBatch(gtin, key));
  // Read-only: only a consumer scan through /resolve-identifier records an event.
  if (child === 'packs' && key) return Response.json(await connector.getPack(gtin, key));
  return Response.json(await connector.getProduct(gtin));
}

async function route(request: Request, env: Env, overrides: Overrides): Promise<Response> {
  const pathname = new URL(request.url).pathname.replace(/\/+$/, '') || '/';

  if (pathname === '/health') {
    if (request.method !== 'GET') return new Response(null, { status: 405, headers: { Allow: 'GET' } });
    return Response.json({
      status: 'ok',
      service: 'counterfeitiq-ai-service',
      visionConfigured: Boolean(env.AI && env.GEMMA_MODEL),
      authConfigured: Boolean(env.AI_SERVICE_TOKEN),
      // Reported this way because NAFDAC has not authorized the live lookups.
      referenceMode: env.REFERENCE_MODE?.trim().toLowerCase() === 'authorized_live' ? 'experimental_live' : 'demo',
    });
  }

  const erp = ERP_ROUTE.test(pathname);
  if (!erp && !['/extract', '/match-product', '/compare-packaging'].includes(pathname)) {
    return serviceError('INVALID_REQUEST', 'The requested route was not found.', 404);
  }
  if (!erp && request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } });

  // No token configured means nobody gets in, not everybody.
  if (!env.AI_SERVICE_TOKEN) {
    return apiErrorResponse({ code: 'SERVICE_UNAVAILABLE', message: 'Service authentication is not configured.', retryable: false });
  }
  if (!(await authorized(request, env.AI_SERVICE_TOKEN))) {
    return serviceError('UNAUTHORIZED', 'A valid service token is required.', 401);
  }

  if (pathname === '/extract') {
    if (!(await withinLimit(env.EXTRACT_LIMITER))) return rateLimited();
    return extractRoute(request, env, overrides);
  }

  if (!(await withinLimit(env.REFERENCE_LIMITER))) return rateLimited();
  const reference = () => createSource({
    mode: env.REFERENCE_MODE,
    greenbookAccessBasis: env.GREENBOOK_ACCESS_BASIS,
    limiter: env.GREENBOOK_LIMITER,
    now: overrides.now,
    ...overrides.source,
  });
  if (erp) return erpRoute(request, pathname, env, overrides, reference);

  const json = await readJson(request);
  if ('failure' in json) return json.failure;
  const source = reference();

  if (pathname === '/match-product') {
    const parsed = matchRequestSchema.safeParse(json.body);
    if (!parsed.success) return serviceError('INVALID_REQUEST', 'The request does not match the contract.', 400);
    return Response.json(await matchProduct(parsed.data.extraction, source));
  }

  const parsed = compareRequestSchema.safeParse(json.body);
  if (!parsed.success) return serviceError('INVALID_REQUEST', 'The request does not match the contract.', 400);
  return Response.json(await comparePackaging(parsed.data.extraction, source, parsed.data.selectedNafdacNumber, overrides.now?.()));
}

export async function handleRequest(request: Request, env: Env = {}, overrides: Overrides = {}): Promise<Response> {
  try {
    return await route(request, env, overrides);
  } catch (error) {
    if (error instanceof AnalysisApiError) return apiErrorResponse(error.detail);
    console.error('request_failed');
    return apiErrorResponse({ code: 'INTERNAL_ERROR', message: 'The request could not be completed.', retryable: true });
  }
}
