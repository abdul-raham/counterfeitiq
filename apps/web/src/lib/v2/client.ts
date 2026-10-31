import type { AnalysisResponse } from '@counterfeitiq/shared';
import { isSampleMode } from '../api';
import { RequestError, type RequestErrorCode } from '../errors';
import { isApiErrorResponse } from '../validate';
import { getSessionToken } from './session';
import { isAuthenticateResponse, isPaginated, isPublicProductSummary } from './validate';
import type {
  ActivateCodeAllocationRequest,
  AuditLogEntry,
  AuthenticatePackResponse,
  AuthenticationOutcome,
  Batch,
  CodeAllocation,
  CreateBatchRequest,
  CreateCodeAllocationRequest,
  CreateManufacturerApplicationRequest,
  CreateProductRequest,
  Investigation,
  Manufacturer,
  ManufacturerApplication,
  PaginatedResponse,
  Product,
  PublicProductSummary,
  VerificationEvent,
} from './contract';

const REQUEST_TIMEOUT_MS = 30_000;

export class PackNotFoundError extends Error {
  constructor() {
    super('Pack not found');
    this.name = 'PackNotFoundError';
  }
}

export class SignInRequiredError extends Error {
  constructor() {
    super('Sign in required');
    this.name = 'SignInRequiredError';
  }
}

export class ForbiddenError extends Error {
  constructor() {
    super('Not permitted');
    this.name = 'ForbiddenError';
  }
}

/** The screen needs an endpoint that the V2 contract does not define yet. */
export class EndpointNotInContractError extends Error {
  readonly endpoint: string;

  constructor(endpoint: string) {
    super(`${endpoint} is not in the V2 contract`);
    this.name = 'EndpointNotInContractError';
    this.endpoint = endpoint;
  }
}

function isOffline(): boolean {
  return navigator.onLine === false;
}

function isValidObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}

async function request<T>(
  path: string,
  init: RequestInit,
  isValid: (body: unknown) => body is T,
  signal?: AbortSignal,
): Promise<T> {
  const base = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/+$/, '');
  if (!base) throw new RequestError('SERVICE_UNAVAILABLE', false);
  if (isOffline()) throw new RequestError('OFFLINE', true);

  const headers = new Headers(init.headers);
  const token = getSessionToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body) headers.set('Content-Type', 'application/json');

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);
  const forwardAbort = () => controller.abort();
  signal?.addEventListener('abort', forwardAbort);

  try {
    const response = await fetch(`${base}${path}`, { ...init, headers, signal: controller.signal });
    const body: unknown = await response.json().catch(() => undefined);
    if (response.status === 401) throw new SignInRequiredError();
    if (response.status === 403) throw new ForbiddenError();
    // A missing route answers SERVICE_UNAVAILABLE, which must not read as an unknown pack.
    if (response.status === 404 && !(isApiErrorResponse(body) && body.error.code === 'SERVICE_UNAVAILABLE')) throw new PackNotFoundError();
    if (!response.ok) {
      if (isApiErrorResponse(body)) {
        throw new RequestError(body.error.code as RequestErrorCode, body.error.retryable);
      }
      throw new RequestError(response.status === 429 ? 'RATE_LIMITED' : 'SERVICE_UNAVAILABLE', true);
    }
    if (!isValid(body)) throw new RequestError('BAD_RESPONSE', true);
    return body;
  } catch (error) {
    if (error instanceof RequestError || error instanceof SignInRequiredError || error instanceof ForbiddenError || error instanceof PackNotFoundError) throw error;
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    if (timedOut) throw new RequestError('REQUEST_TIMEOUT', true);
    throw new RequestError(isOffline() ? 'OFFLINE' : 'SERVICE_UNAVAILABLE', true);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', forwardAbort);
  }
}

const sample = () => import('../../features/sample/v2Sample');

function post(body: unknown): RequestInit {
  return { method: 'POST', body: JSON.stringify(body) };
}

/** For screens whose endpoint is missing: sample mode has fixtures, anything else says so. */
async function notInContract<T>(endpoint: string, fixture: (module: Awaited<ReturnType<typeof sample>>) => T | Promise<T>): Promise<T> {
  if (isSampleMode()) return fixture(await sample());
  throw new EndpointNotInContractError(endpoint);
}

// ----- Public -----

export async function scanPack(identifier: string, signal?: AbortSignal): Promise<PublicProductSummary> {
  if (isSampleMode()) return (await sample()).sampleScan(identifier);
  return request(`/api/public/scan/${encodeURIComponent(identifier)}`, { method: 'GET' }, isPublicProductSummary, signal);
}

export async function authenticatePack(publicIdentifier: string, secretCode: string, signal?: AbortSignal): Promise<AuthenticatePackResponse> {
  if (isSampleMode()) return (await sample()).sampleAuthenticate(publicIdentifier, secretCode);
  return request('/api/public/authenticate', post({ publicIdentifier, secretCode }), isAuthenticateResponse, signal);
}

export async function createInvestigation(input: {
  publicIdentifier: string | null;
  authenticationOutcome: AuthenticationOutcome | null;
  aiAnalysis: AnalysisResponse | null;
  notes: string | null;
}): Promise<Investigation> {
  if (isSampleMode()) return (await sample()).sampleInvestigation(input);
  return request('/api/public/investigations', post(input), (body): body is Investigation => isValidObject(body) && 'id' in body);
}

// ----- Manufacturer: endpoints in the contract -----

export async function submitApplication(input: CreateManufacturerApplicationRequest): Promise<ManufacturerApplication> {
  if (isSampleMode()) return (await sample()).sampleApply(input);
  return request('/api/manufacturer/applications', post(input), (body): body is ManufacturerApplication => isValidObject(body) && 'status' in body);
}

export async function listProducts(): Promise<PaginatedResponse<Product>> {
  if (isSampleMode()) return (await sample()).sampleProducts();
  return request('/api/manufacturer/products', { method: 'GET' }, (body): body is PaginatedResponse<Product> => isPaginated(body));
}

export async function createProduct(input: CreateProductRequest): Promise<Product> {
  if (isSampleMode()) return (await sample()).sampleCreateProduct(input);
  return request('/api/manufacturer/products', post(input), (body): body is Product => isValidObject(body) && 'id' in body);
}

export async function createBatch(input: CreateBatchRequest): Promise<Batch> {
  if (isSampleMode()) return (await sample()).sampleCreateBatch(input);
  return request('/api/manufacturer/batches', post(input), (body): body is Batch => isValidObject(body) && 'id' in body);
}

export async function createAllocation(input: CreateCodeAllocationRequest): Promise<CodeAllocation> {
  if (isSampleMode()) return (await sample()).sampleCreateAllocation(input);
  return request('/api/manufacturer/code-allocations', post(input), (body): body is CodeAllocation => isValidObject(body) && 'id' in body);
}

export async function activateAllocation(id: string, input: ActivateCodeAllocationRequest): Promise<CodeAllocation> {
  if (isSampleMode()) return (await sample()).sampleActivateAllocation(id, input);
  return request(`/api/manufacturer/code-allocations/${encodeURIComponent(id)}/activate`, post(input), (body): body is CodeAllocation => isValidObject(body) && 'id' in body);
}

export async function listManufacturerEvents(): Promise<PaginatedResponse<VerificationEvent>> {
  if (isSampleMode()) return (await sample()).sampleEvents();
  return request('/api/manufacturer/verification-events', { method: 'GET' }, (body): body is PaginatedResponse<VerificationEvent> => isPaginated(body));
}

// ----- Manufacturer: screens waiting for an endpoint -----

export const listBatches = () => notInContract('GET /api/manufacturer/batches', (s) => s.sampleBatches());
export const listAllocations = () => notInContract('GET /api/manufacturer/code-allocations', (s) => s.sampleAllocations());
export const getManufacturerProfile = () => notInContract('GET /api/manufacturer/profile', (s) => s.sampleProfile());

// ----- Admin: endpoints in the contract -----

export async function listApplications(): Promise<PaginatedResponse<ManufacturerApplication>> {
  if (isSampleMode()) return (await sample()).sampleApplications();
  return request('/api/admin/applications', { method: 'GET' }, (body): body is PaginatedResponse<ManufacturerApplication> => isPaginated(body));
}

export async function decideApplication(id: string, decision: 'APPROVE' | 'REJECT', reason: string): Promise<ManufacturerApplication> {
  if (isSampleMode()) return (await sample()).sampleDecide(id, decision, reason);
  return request(`/api/admin/manufacturers/${encodeURIComponent(id)}/decision`, post({ decision, reason }), (body): body is ManufacturerApplication => isValidObject(body) && 'status' in body);
}

export async function revokeCode(id: string, reason: string): Promise<void> {
  if (isSampleMode()) return (await sample()).sampleRevoke(id, reason);
  await request(`/api/admin/codes/${encodeURIComponent(id)}/revoke`, post({ reason }), (body): body is object => isValidObject(body));
}

// ----- Admin: screens waiting for an endpoint -----

export const adminManufacturers = (): Promise<PaginatedResponse<Manufacturer>> => notInContract('GET /api/admin/manufacturers', (s) => s.sampleManufacturers());
export const adminProducts = (): Promise<PaginatedResponse<Product>> => notInContract('GET /api/admin/products', (s) => s.sampleProducts());
export const adminBatches = (): Promise<PaginatedResponse<Batch>> => notInContract('GET /api/admin/batches', (s) => s.sampleBatches());
export const adminAllocations = (): Promise<PaginatedResponse<CodeAllocation>> => notInContract('GET /api/admin/code-allocations', (s) => s.sampleAllocations());
export const adminEvents = (): Promise<PaginatedResponse<VerificationEvent>> => notInContract('GET /api/admin/verification-events', (s) => s.sampleEvents());
export const adminInvestigations = (): Promise<PaginatedResponse<Investigation>> => notInContract('GET /api/admin/investigations', (s) => s.sampleInvestigations());
export const adminAudit = (): Promise<PaginatedResponse<AuditLogEntry>> => notInContract('GET /api/admin/audit-log', (s) => s.sampleAudit());
