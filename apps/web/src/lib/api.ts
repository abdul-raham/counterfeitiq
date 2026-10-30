import type { AnalysisResponse, ReferenceLookupResult } from '@counterfeitiq/shared';
import { RequestError, type RequestErrorCode } from './errors';
import { isAnalysisResponse, isApiErrorResponse, isReferenceLookupResult } from './validate';

const REQUEST_TIMEOUT_MS = 60_000;

export function isSampleMode(): boolean {
  return import.meta.env.VITE_USE_SAMPLE_DATA === 'true';
}

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
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

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);
  const forwardAbort = () => controller.abort();
  signal?.addEventListener('abort', forwardAbort);

  try {
    const response = await fetch(`${base}${path}`, { ...init, signal: controller.signal });
    const body: unknown = await response.json().catch((error: unknown) => {
      if (controller.signal.aborted) throw error;
      return undefined;
    });

    if (!response.ok) {
      if (isApiErrorResponse(body)) {
        throw new RequestError(body.error.code as RequestErrorCode, body.error.retryable);
      }
      throw new RequestError(response.status === 429 ? 'RATE_LIMITED' : 'SERVICE_UNAVAILABLE', true);
    }
    if (!isValid(body)) throw new RequestError('BAD_RESPONSE', true);
    return body;
  } catch (error) {
    if (error instanceof RequestError) throw error;
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    if (timedOut) throw new RequestError('REQUEST_TIMEOUT', true);
    throw new RequestError(isOffline() ? 'OFFLINE' : 'SERVICE_UNAVAILABLE', true);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', forwardAbort);
  }
}

export async function analyzeImage(image: File, signal?: AbortSignal): Promise<AnalysisResponse> {
  if (isSampleMode()) {
    const { sampleAnalyze } = await import('../features/sample/sample');
    return sampleAnalyze(signal);
  }
  const body = new FormData();
  body.append('image', image);
  return request('/api/analyze', { method: 'POST', body }, isAnalysisResponse, signal);
}

export async function lookupReference(number: string, signal?: AbortSignal): Promise<ReferenceLookupResult> {
  if (isSampleMode()) {
    const { sampleLookup } = await import('../features/sample/sample');
    return sampleLookup(number, signal);
  }
  return request(`/api/reference/${encodeURIComponent(number)}`, { method: 'GET' }, isReferenceLookupResult, signal);
}
