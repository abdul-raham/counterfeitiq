import { RequestError, type RequestErrorCode } from '../errors';
import { isApiErrorResponse } from '../validate';
import type { ResolveRequest, ResolveResponse } from '@counterfeitiq/shared/v3';
import { isResolveResponse } from './validate';

const REQUEST_TIMEOUT_MS = 20_000;
const SESSION_KEY = 'counterfeitiq.anonymousSession';
const COUNTED_KEY = 'counterfeitiq.countedScans';
const MAX_COUNTED = 50;

/** A random ID for this browser tab only. It holds no personal information. */
export function getAnonymousSessionId(): string | null {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const created = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, created);
    return created;
  } catch {
    return null;
  }
}

function isOffline(): boolean {
  return navigator.onLine === false;
}

async function sendResolve(request: ResolveRequest): Promise<ResolveResponse> {
  const base = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/+$/, '');
  if (!base) throw new RequestError('SERVICE_UNAVAILABLE', false);
  if (isOffline()) throw new RequestError('OFFLINE', true);

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    // POST keeps serial numbers out of URLs in server logs.
    const response = await fetch(`${base}/api/v3/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: controller.signal,
    });
    const body: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      if (isApiErrorResponse(body)) throw new RequestError(body.error.code as RequestErrorCode, body.error.retryable);
      throw new RequestError(response.status === 429 ? 'RATE_LIMITED' : 'SERVICE_UNAVAILABLE', true);
    }
    if (!isResolveResponse(body)) throw new RequestError('BAD_RESPONSE', true);
    return body;
  } catch (error) {
    if (error instanceof RequestError) throw error;
    if (timedOut) throw new RequestError('REQUEST_TIMEOUT', true);
    throw new RequestError(isOffline() ? 'OFFLINE' : 'SERVICE_UNAVAILABLE', true);
  } finally {
    clearTimeout(timer);
  }
}

export async function resolveIdentifier(identifier: string, recordScan: boolean): Promise<ResolveResponse> {
  const request: ResolveRequest = { identifier, recordScan, anonymousSessionId: recordScan ? getAnonymousSessionId() : null };
  return sendResolve(request);
}

const countedInMemory = new Set<string>();

/**
 * True the first time a navigation is seen. The browser keeps a page's navigation state across
 * a reload or the back button, so without this those would be counted as repeat scans.
 */
function claimFreshScan(navigationKey: string): boolean {
  if (countedInMemory.has(navigationKey)) return false;
  countedInMemory.add(navigationKey);
  try {
    const counted = JSON.parse(sessionStorage.getItem(COUNTED_KEY) ?? '[]') as string[];
    if (counted.includes(navigationKey)) return false;
    sessionStorage.setItem(COUNTED_KEY, JSON.stringify([...counted, navigationKey].slice(-MAX_COUNTED)));
  } catch {
    // Without storage, the in-memory record above still covers this page's lifetime.
  }
  return true;
}

// React may run an effect twice, and a repeat here would look like a repeat scan.
// One navigation therefore sends one request.
const inFlight = new Map<string, Promise<ResolveResponse>>();

export function resolveOnce(navigationKey: string, identifier: string, recordScan: boolean): Promise<ResolveResponse> {
  const key = `${navigationKey}:${identifier}`;
  const existing = inFlight.get(key);
  if (existing) return existing;
  const pending = resolveIdentifier(identifier, recordScan && claimFreshScan(navigationKey));
  inFlight.set(key, pending);
  if (inFlight.size > 20) inFlight.delete(inFlight.keys().next().value as string);
  pending.catch(() => inFlight.delete(key));
  return pending;
}
