import type { AuthenticatePackResponse, AuthenticationOutcome, PaginatedResponse, PublicProductSummary } from './contract';

export const AUTHENTICATION_OUTCOMES: AuthenticationOutcome[] = [
  'FIRST_VERIFICATION', 'PREVIOUSLY_VERIFIED', 'INVALID_CODE', 'PRODUCT_MISMATCH',
  'CODE_REVOKED', 'BATCH_BLOCKED', 'CODE_NOT_ACTIVE', 'VERIFICATION_UNAVAILABLE',
];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNullableString(value: unknown): boolean {
  return typeof value === 'string' || value === null;
}

export function isPaginated<T>(value: unknown): value is PaginatedResponse<T> {
  return isObject(value) && Array.isArray(value.items) && isNullableString(value.nextCursor);
}

// These checks are what stop a malformed reply from ever being shown as an authenticity claim.
export function isPublicProductSummary(value: unknown): value is PublicProductSummary {
  if (!isObject(value) || value.authenticityConfirmed !== false || value.secretCodeRequired !== true) return false;
  const { product, manufacturer, batch, pack } = value;
  return isObject(product) && typeof product.name === 'string' && Array.isArray(product.activeIngredients)
    && isObject(manufacturer) && typeof manufacturer.displayName === 'string'
    && isObject(batch) && typeof batch.batchNumber === 'string' && typeof batch.status === 'string'
    && isObject(pack) && typeof pack.publicIdentifier === 'string' && typeof pack.status === 'string';
}

export function isAuthenticateResponse(value: unknown): value is AuthenticatePackResponse {
  return isObject(value)
    && value.authenticityConfirmed === false
    && AUTHENTICATION_OUTCOMES.includes(value.outcome as AuthenticationOutcome)
    && typeof value.checkedAt === 'string'
    && isNullableString(value.firstVerifiedAt)
    && typeof value.message === 'string'
    && (value.product === null || isPublicProductSummary(value.product));
}

/**
 * Reads a pack identifier from a QR code or typed text. The app only ever routes to its own
 * product page, so a QR code cannot send someone to a site it names.
 */
export function parsePackIdentifier(raw: string): string | null {
  const text = raw.trim();
  const plain = /^[A-Za-z0-9][A-Za-z0-9_-]{3,63}$/;
  if (plain.test(text)) return text;
  try {
    const url = new URL(text);
    const fromPath = /\/(?:product|p)\/([^/]+)\/?$/.exec(url.pathname)?.[1];
    const candidate = fromPath ? decodeURIComponent(fromPath) : url.searchParams.get('id');
    return candidate && plain.test(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

/** A secret code is compared by the server. This only rejects what cannot possibly be one. */
export function cleanSecretCode(raw: string): string | null {
  const code = raw.trim().replace(/\s+/g, '');
  return code.length >= 4 && code.length <= 64 ? code : null;
}
