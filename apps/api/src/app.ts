import type { RateLimiter } from './adapters/greenbook';
import { createReferenceAdapter } from './adapters/reference';
import { extractProduct, type VisionModel } from './ai/extraction';
import { analyzeRequest, type AnalyzeDependencies } from './routes/analyze';
import { apiErrorResponse } from './routes/errors';
import { referenceRequest } from './routes/reference';
import { resolveRequest } from './v3/resolve';

interface RequestLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  ENVIRONMENT?: string;
  AI?: VisionModel;
  GEMMA_MODEL?: string;
  REFERENCE_MODE?: string;
  GREENBOOK_ACCESS_BASIS?: string;
  GREENBOOK_LIMITER?: RateLimiter;
  ALLOWED_ORIGINS?: string;
  ANALYZE_LIMITER?: RequestLimiter;
  REFERENCE_LIMITER?: RequestLimiter;
}

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('Origin');
  const allowed = (env.ALLOWED_ORIGINS ?? '').split(',').map((item) => item.trim()).filter(Boolean);
  if (!origin || !allowed.includes(origin)) return { Vary: 'Origin' };
  return {
    Vary: 'Origin',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Access-Control-Max-Age': '86400',
  };
}

export function withCors(response: Response, cors: Record<string, string>): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(cors)) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function createDependencies(env: Env = {}): AnalyzeDependencies {
  const referenceAdapter = createReferenceAdapter({
    mode: env.REFERENCE_MODE,
    greenbookAccessBasis: env.GREENBOOK_ACCESS_BASIS,
    greenbook: { limiter: env.GREENBOOK_LIMITER, readProductPage: true },
  });

  return {
    extractProduct: (image: Blob) =>
      extractProduct(image, {
        ai: env.AI,
        model: env.GEMMA_MODEL,
      }),
    lookupMedicine: (number: string) => referenceAdapter.lookupMedicine(number),
  };
}

async function withinLimit(limiter: RequestLimiter | undefined, request: Request): Promise<boolean> {
  if (!limiter) return true;
  try {
    // Shoppers are anonymous, so the client address is the only available key.
    const { success } = await limiter.limit({ key: request.headers.get('cf-connecting-ip') ?? 'unknown' });
    return success;
  } catch {
    return true;
  }
}

function rateLimited(): Response {
  const response = apiErrorResponse({
    code: 'RATE_LIMITED',
    message: 'Too many requests. Please try again in a minute.',
    retryable: true,
  });
  response.headers.set('Retry-After', '60');
  return response;
}

async function route(request: Request, url: URL, env: Env): Promise<Response> {
  const pathname = url.pathname.replace(/\/+$/, '') || '/';
  const deps = createDependencies(env);

  if (pathname === '/api/health') {
    if (request.method !== 'GET') return new Response(null, { status: 405, headers: { Allow: 'GET' } });
    return Response.json({
      status: 'ok',
      service: 'counterfeitiq-api',
      environment: env.ENVIRONMENT ?? 'production',
      visionConfigured: Boolean(env.AI && env.GEMMA_MODEL),
      // Reported this way because NAFDAC has not authorized the live lookups.
      referenceMode: env.REFERENCE_MODE === 'authorized_live' ? 'experimental_live' : 'demo',
      timestamp: new Date().toISOString(),
    });
  }

  if (pathname === '/api/analyze') {
    if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } });
    if (!(await withinLimit(env.ANALYZE_LIMITER, request))) return rateLimited();
    return analyzeRequest(request, deps);
  }

  if (pathname === '/api/v3/resolve') {
    if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } });
    if (!(await withinLimit(env.REFERENCE_LIMITER, request))) return rateLimited();
    return resolveRequest(request);
  }

  if (pathname.startsWith('/api/reference/')) {
    if (request.method !== 'GET') return new Response(null, { status: 405, headers: { Allow: 'GET' } });
    if (!(await withinLimit(env.REFERENCE_LIMITER, request))) return rateLimited();
    return referenceRequest(request, url.pathname.slice('/api/reference/'.length), deps);
  }

  return apiErrorResponse(
    { code: 'SERVICE_UNAVAILABLE', message: 'The requested route was not found.', retryable: false },
    404,
  );
}

export async function handleRequest(request: Request, env: Env = {}): Promise<Response> {
  const cors = corsHeaders(request, env);
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }
  return withCors(await route(request, new URL(request.url), env), cors);
}
