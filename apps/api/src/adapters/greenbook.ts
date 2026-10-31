import type { MedicineReference, ReferenceLookupResult } from '@counterfeitiq/shared';
import { normalizeNafdacNumber } from '../services/normalize';
import { canonicalNafdacNumber, INVALID_NUMBER_NOTE, notExecuted, type ReferenceAdapter } from './contract';

export const GREENBOOK_URL = 'https://greenbook.nafdac.gov.ng/';

const USER_AGENT = 'CounterfeitIQ/0.1 (+https://github.com/abdul-raham/counterfeitiq)';
const DEFAULT_TIMEOUT_MS = 8_000;
// The site's own table asks for 10 rows, and it is the size that has been verified.
const PAGE_LENGTH = 10;

const DEFAULT_FOUND_TTL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_NOT_FOUND_TTL_MS = 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 500;

const MAX_REQUESTS_PER_MINUTE = 30;
const MIN_BACKOFF_MS = 60 * 1000;
const MAX_BACKOFF_MS = 60 * 60 * 1000;

// Column order sent by the Greenbook page itself.
const COLUMNS = [
  'product_name',
  'ingredient.ingredient_name',
  'product_category.name',
  'product_category_id',
  'ingredient.synonym',
  'NAFDAC',
  'form.name',
  'route.name',
  'strength',
  'applicant.name',
  'approval_date',
  'status',
];

const LABEL = /^(?:NAFDAC\s*(?:REG(?:ISTRATION)?\.?)?\s*(?:NO\.?|NUMBER)?|REG(?:ISTRATION)?\.?\s*(?:NO\.?|NUMBER))\s*[:.-]?\s*/;

const NOTES = {
  timeout: 'The NAFDAC Greenbook did not respond in time.',
  network: 'The NAFDAC Greenbook could not be reached.',
  rateLimited: 'The NAFDAC Greenbook asked us to slow down.',
  http: 'The NAFDAC Greenbook returned an error.',
  malformed: 'The NAFDAC Greenbook returned an unexpected response.',
  tooBroad: 'The NAFDAC Greenbook returned more results than could be checked.',
  ambiguous: 'The NAFDAC Greenbook lists conflicting records for this number.',
  notActive: 'The NAFDAC Greenbook does not list this registration as active.',
  throttled: 'The lookup was held back to limit requests to the NAFDAC Greenbook.',
  needsHyphen: 'The number has no hyphen, and the Greenbook search can only match it with one.',
} as const;

/** Cloudflare rate limit binding. It spans isolates, which GreenbookState cannot. */
export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface GreenbookState {
  cache: Map<string, { result: ReferenceLookupResult; expiresAt: number }>;
  windowStartedAt: number;
  requestsInWindow: number;
  blockedUntil: number;
}

export function createGreenbookState(): GreenbookState {
  return { cache: new Map(), windowStartedAt: 0, requestsInWindow: 0, blockedUntil: 0 };
}

// Dependencies are rebuilt for every request, so the state lives per isolate. It holds
// plain data only: a Worker must not await a promise created by another request.
const isolateState = createGreenbookState();

export interface GreenbookOptions {
  timeoutMs?: number;
  foundTtlMs?: number;
  notFoundTtlMs?: number;
  fetch?: typeof fetch;
  limiter?: RateLimiter;
  now?: () => Date;
  state?: GreenbookState;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The term sent to the Greenbook, which runs a SQL LIKE over its text. Unlike the
 * comparison form it keeps the hyphen, because "A6100103" cannot find "A6-100103".
 */
export function toGreenbookQuery(value: string): string | null {
  const query = value
    .normalize('NFKC')
    .toUpperCase()
    .trim()
    .replace(/[‐-―−]/g, '-')
    .replace(LABEL, '')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/, '-');
  if (query.length > 20 || !/\d/.test(query)) return null;
  return /^[A-Z0-9]+(?:-[A-Z0-9]+)+$/.test(query) ? query : null;
}

function buildSearchUrl(query: string): string {
  const params = new URLSearchParams({ draw: '1', start: '0', length: String(PAGE_LENGTH) });
  params.set('search[value]', query);
  params.set('search[regex]', 'false');
  params.set('search_ingredient', '');
  COLUMNS.forEach((column, index) => {
    params.set(`columns[${index}][data]`, column);
    params.set(`columns[${index}][name]`, column);
    params.set(`columns[${index}][searchable]`, 'true');
  });
  return `${GREENBOOK_URL}?${params.toString()}`;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&quot;|&#0*34;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return decodeEntities(value).replace(/\s+/g, ' ').trim() || null;
}

function nestedText(row: Record<string, unknown>, key: string, field: string): string | null {
  const nested = row[key];
  return isObject(nested) ? cleanText(nested[field]) : null;
}

interface SearchPage {
  rows: Record<string, unknown>[];
  recordsFiltered: number;
}

// An error reply can still carry an empty data array, and reading that as "no records"
// would turn a Greenbook fault into an official miss. So everything is checked first.
function parseSearchPage(raw: unknown): SearchPage | null {
  if (!isObject(raw) || raw.error !== undefined || raw.draw !== 1) return null;
  const { data, recordsTotal, recordsFiltered } = raw;
  if (!Array.isArray(data) || !data.every(isObject)) return null;
  if (!Number.isInteger(recordsTotal) || (recordsTotal as number) < 1) return null;
  if (!Number.isInteger(recordsFiltered) || (recordsFiltered as number) < 0) return null;
  const filtered = recordsFiltered as number;
  if (data.length > filtered || (filtered > 0 && data.length === 0)) return null;
  // A row with no number could be the one asked about, so a miss would not be conclusive.
  if (!data.every((row) => cleanText(row.NAFDAC))) return null;
  return { rows: data, recordsFiltered: filtered };
}

function toMedicineReference(row: Record<string, unknown>, retrievedAt: string): MedicineReference | null {
  const productName = cleanText(row.product_name)?.replace(/[#*]/g, '').trim();
  const nafdacNumber = cleanText(row.NAFDAC);
  if (!productName || !nafdacNumber) return null;

  const ingredient = nestedText(row, 'ingredient', 'ingredient_name') ?? cleanText(row.ingredient_name);
  const expiry = cleanText(row.expiry_date);
  return {
    productName,
    nafdacNumber,
    // The Greenbook names an applicant, who is often not the manufacturer on the pack.
    manufacturer: null,
    strength: cleanText(row.strength),
    ingredients: ingredient ? [ingredient] : [],
    registrationExpiry: expiry && /^\d{4}-\d{2}-\d{2}$/.test(expiry) ? expiry : null,
    retrievedAt,
  };
}

function liveProvenance(requestedAt: string) {
  return {
    source: 'NAFDAC_GREENBOOK',
    mode: 'LIVE_OFFICIAL',
    authoritative: true,
    requestedAt,
    sourceUrl: GREENBOOK_URL,
  } as const;
}

function unavailable(requestedAt: string, note: string): ReferenceLookupResult {
  console.warn('greenbook lookup unavailable:', note);
  return {
    status: 'SOURCE_UNAVAILABLE',
    record: null,
    provenance: { ...liveProvenance(requestedAt), authoritative: false, note },
  };
}

function interpretPage(page: SearchPage, key: string, requestedAt: string): ReferenceLookupResult {
  // The unseen results could hold the record, or a second one with the same number.
  if (page.recordsFiltered > page.rows.length) return unavailable(requestedAt, NOTES.tooBroad);

  const matches = page.rows.filter((row) => canonicalNafdacNumber(cleanText(row.NAFDAC) ?? '') === key);
  if (matches.length === 0) {
    return { status: 'NOT_FOUND', record: null, provenance: liveProvenance(requestedAt) };
  }

  const records = matches.map((row) => toMedicineReference(row, requestedAt));
  const record = records[0];
  if (!record || records.includes(null)) return unavailable(requestedAt, NOTES.malformed);

  const distinct = new Set(matches.map((row, index) => JSON.stringify([records[index], row.status])));
  if (distinct.size > 1) return unavailable(requestedAt, NOTES.ambiguous);

  const active = matches[0]?.status === 'Active';
  return {
    status: 'FOUND',
    record,
    provenance: active ? liveProvenance(requestedAt) : { ...liveProvenance(requestedAt), note: NOTES.notActive },
  };
}

function backoffMs(response: Response): number {
  const seconds = Number(response.headers.get('Retry-After'));
  const requested = Number.isFinite(seconds) ? seconds * 1000 : 0;
  return Math.min(Math.max(requested, MIN_BACKOFF_MS), MAX_BACKOFF_MS);
}

function withinIsolateBudget(state: GreenbookState, nowMs: number): boolean {
  if (nowMs - state.windowStartedAt >= 60_000) {
    state.windowStartedAt = nowMs;
    state.requestsInWindow = 0;
  }
  if (state.requestsInWindow >= MAX_REQUESTS_PER_MINUTE) return false;
  state.requestsInWindow += 1;
  return true;
}

function remember(
  state: GreenbookState,
  key: string,
  result: ReferenceLookupResult,
  nowMs: number,
  ttls: { found: number; notFound: number },
): void {
  if (result.status === 'SOURCE_UNAVAILABLE') return;
  if (!state.cache.has(key) && state.cache.size >= MAX_CACHE_ENTRIES) {
    const oldest = state.cache.keys().next().value;
    if (oldest !== undefined) state.cache.delete(oldest);
  }
  const ttl = result.status === 'FOUND' ? ttls.found : ttls.notFound;
  state.cache.set(key, { result, expiresAt: nowMs + ttl });
}

/** The live NAFDAC Greenbook. Failures are returned as results, never thrown. */
export function createGreenbookAdapter(options: GreenbookOptions = {}): ReferenceAdapter {
  const state = options.state ?? isolateState;
  const ttls = {
    found: options.foundTtlMs ?? DEFAULT_FOUND_TTL_MS,
    notFound: options.notFoundTtlMs ?? DEFAULT_NOT_FOUND_TTL_MS,
  };
  const now = options.now ?? (() => new Date());
  const send = options.fetch ?? ((input, init) => fetch(input, init));

  async function search(query: string, key: string): Promise<ReferenceLookupResult> {
    const started = now();
    const requestedAt = started.toISOString();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    let raw: unknown;
    try {
      // No cookies or tokens are sent. The header asks for the JSON the page itself uses.
      const response = await send(buildSearchUrl(query), {
        headers: {
          Accept: 'application/json',
          'User-Agent': USER_AGENT,
          'X-Requested-With': 'XMLHttpRequest',
        },
        redirect: 'manual',
        signal: controller.signal,
      });
      if (response.status === 429 || response.status === 503) {
        state.blockedUntil = started.getTime() + backoffMs(response);
        return unavailable(requestedAt, response.status === 429 ? NOTES.rateLimited : NOTES.http);
      }
      if (response.status !== 200) return unavailable(requestedAt, NOTES.http);
      if (!response.headers.get('Content-Type')?.toLowerCase().includes('json')) {
        return unavailable(requestedAt, NOTES.malformed);
      }
      raw = JSON.parse(await response.text());
    } catch (error) {
      if (error instanceof SyntaxError) return unavailable(requestedAt, NOTES.malformed);
      return unavailable(requestedAt, controller.signal.aborted ? NOTES.timeout : NOTES.network);
    } finally {
      clearTimeout(timer);
    }

    const page = parseSearchPage(raw);
    if (!page) return unavailable(requestedAt, NOTES.malformed);
    const result = interpretPage(page, key, requestedAt);
    remember(state, key, result, started.getTime(), ttls);
    return result;
  }

  return {
    async lookupMedicine(nafdacNumber: string): Promise<ReferenceLookupResult> {
      if (!normalizeNafdacNumber(nafdacNumber)) return notExecuted(INVALID_NUMBER_NOTE);
      const query = toGreenbookQuery(nafdacNumber);
      const key = query && canonicalNafdacNumber(query);
      if (!key) return notExecuted(NOTES.needsHyphen);

      const nowMs = now().getTime();
      const cached = state.cache.get(key);
      // A cached answer keeps its original timestamp, so the report says when it was checked.
      if (cached && cached.expiresAt > nowMs) return cached.result;

      if (nowMs < state.blockedUntil || !withinIsolateBudget(state, nowMs)) {
        return notExecuted(NOTES.throttled);
      }
      if (options.limiter) {
        try {
          if (!(await options.limiter.limit({ key: 'greenbook' })).success) return notExecuted(NOTES.throttled);
        } catch {
          return notExecuted(NOTES.throttled);
        }
      }
      return search(query, key);
    },
  };
}
