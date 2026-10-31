import { RequestError, type RequestErrorCode } from '../errors';
import { isApiErrorResponse } from '../validate';
import type { ProductReport } from './contract';
import { isProductReport } from './validate';

const REQUEST_TIMEOUT_MS = 20_000;
const DEVICE_KEY = 'counterfeitiq.scanDevice';
const REPORTS_KEY = 'counterfeitiq.scanReports';
const MAX_SAVED_REPORTS = 10;

/** A random value for this browser, holding no personal information. Clearing site data resets it. */
export function getScanDeviceId(): string | null {
  try {
    const existing = localStorage.getItem(DEVICE_KEY);
    if (existing) return existing;
    const created = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, created);
    return created;
  } catch {
    return null;
  }
}

function isOffline(): boolean {
  return navigator.onLine === false;
}

export async function scanIdentifier(identifier: string): Promise<ProductReport> {
  const base = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/+$/, '');
  if (!base) throw new RequestError('SERVICE_UNAVAILABLE', false);
  if (isOffline()) throw new RequestError('OFFLINE', true);

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);
  const device = getScanDeviceId();

  try {
    const response = await fetch(`${base}/api/scan?identifier=${encodeURIComponent(identifier)}`, {
      headers: device ? { 'X-Scan-Device': device } : {},
      signal: controller.signal,
    });
    const body: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      if (isApiErrorResponse(body)) throw new RequestError(body.error.code as RequestErrorCode, body.error.retryable);
      throw new RequestError(response.status === 429 ? 'RATE_LIMITED' : 'SERVICE_UNAVAILABLE', true);
    }
    if (!isProductReport(body)) throw new RequestError('BAD_RESPONSE', true);
    return body;
  } catch (error) {
    if (error instanceof RequestError) throw error;
    if (timedOut) throw new RequestError('REQUEST_TIMEOUT', true);
    throw new RequestError(isOffline() ? 'OFFLINE' : 'SERVICE_UNAVAILABLE', true);
  } finally {
    clearTimeout(timer);
  }
}

type SavedReports = [string, ProductReport][];

function readSaved(): SavedReports {
  try {
    return JSON.parse(sessionStorage.getItem(REPORTS_KEY) ?? '[]') as SavedReports;
  } catch {
    return [];
  }
}

function save(key: string, report: ProductReport) {
  try {
    const others = readSaved().filter(([savedKey]) => savedKey !== key);
    sessionStorage.setItem(REPORTS_KEY, JSON.stringify([...others, [key, report]].slice(-MAX_SAVED_REPORTS)));
  } catch {
    // Without storage, a reload simply counts as another scan.
  }
}

const inFlight = new Map<string, Promise<ProductReport>>();

/**
 * The first page a tab loads always has the router key 'default', so opening a QR link again in
 * the same tab looks like the same navigation. Only the browser can tell that apart from a reload.
 */
function isNewArrival(navigationKey: string): boolean {
  if (navigationKey !== 'default') return false;
  const [entry] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
  return entry?.type === 'navigate';
}

/**
 * Every call to /api/scan counts as a scan. So one navigation sends one request: React can run an
 * effect twice, and a reload or the back button returns to the same navigation. Those reuse the
 * first report rather than recording a repeat scan that never happened.
 */
export function scanOnce(navigationKey: string, identifier: string): Promise<ProductReport> {
  const key = `${navigationKey}:${identifier}`;
  const existing = inFlight.get(key);
  if (existing) return existing;
  const saved = isNewArrival(navigationKey) ? undefined : readSaved().find(([savedKey]) => savedKey === key)?.[1];
  const pending = saved ? Promise.resolve(saved) : scanIdentifier(identifier);
  inFlight.set(key, pending);
  pending.then(
    (report) => { if (!saved) save(key, report); },
    () => inFlight.delete(key),
  );
  return pending;
}
