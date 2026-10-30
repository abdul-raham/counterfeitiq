import type { AnalysisResponse, ApiErrorResponse, ReferenceLookupResult } from '@counterfeitiq/shared';

const VERIFICATION_STATUSES = [
  'REGISTRATION_DETAILS_MATCH',
  'DETAILS_MISMATCH',
  'RECORD_NOT_FOUND',
  'INSUFFICIENT_EVIDENCE',
  'REFERENCE_UNAVAILABLE',
];
const EXPIRY_STATUSES = ['EXPIRED', 'NOT_EXPIRED', 'UNKNOWN'];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  return isObject(value) && isObject(value.error)
    && typeof value.error.code === 'string'
    && typeof value.error.retryable === 'boolean';
}

// Provenance rules are checked at runtime because they are what stops a demo
// fixture or a failed lookup from being displayed as an official NAFDAC result.
export function isReferenceLookupResult(value: unknown): value is ReferenceLookupResult {
  if (!isObject(value) || !isObject(value.provenance)) return false;
  const { mode, source, authoritative } = value.provenance;
  const live = mode === 'LIVE_OFFICIAL' && source === 'NAFDAC_GREENBOOK' && authoritative === true;
  const fixture = mode === 'DEMO_FIXTURE' && source === 'DEMO_FIXTURE' && authoritative === false;

  switch (value.status) {
    case 'FOUND':
      return isObject(value.record)
        && typeof value.record.productName === 'string'
        && typeof value.record.nafdacNumber === 'string'
        && Array.isArray(value.record.ingredients)
        && (live || fixture);
    case 'NOT_FOUND':
      return value.record === null && live;
    case 'SOURCE_UNAVAILABLE':
      return value.record === null && authoritative === false;
    default:
      return false;
  }
}

export function isAnalysisResponse(value: unknown): value is AnalysisResponse {
  if (!isObject(value) || !isObject(value.extracted) || !isObject(value.verification)) return false;
  const { verification, extracted, reference } = value;

  if (!Array.isArray(extracted.ingredients)) return false;
  if (verification.physicalAuthenticityConfirmed !== false) return false;
  if (!VERIFICATION_STATUSES.includes(verification.status as string)) return false;
  if (!EXPIRY_STATUSES.includes(verification.packageExpiryStatus as string)) return false;
  if (!EXPIRY_STATUSES.includes(verification.registrationExpiryStatus as string)) return false;
  if (typeof verification.summary !== 'string') return false;
  if (!Array.isArray(verification.findings) || !Array.isArray(verification.recommendedActions)) return false;
  if (reference !== null && !isReferenceLookupResult(reference)) return false;

  // A verdict must agree with the lookup it claims to come from.
  const lookup = isReferenceLookupResult(reference) ? reference.status : null;
  if (verification.status === 'RECORD_NOT_FOUND' && lookup !== 'NOT_FOUND') return false;
  if (verification.status === 'REGISTRATION_DETAILS_MATCH' && lookup !== 'FOUND') return false;
  if (verification.status === 'DETAILS_MISMATCH' && lookup !== 'FOUND') return false;

  return true;
}
