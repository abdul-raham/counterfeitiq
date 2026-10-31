import type { AnalysisResponse, ApiErrorResponse, ReferenceLookupResult } from '@counterfeitiq/shared';

const VERIFICATION_STATUSES = [
  'REGISTRATION_DETAILS_MATCH',
  'DETAILS_MISMATCH',
  'RECORD_NOT_FOUND',
  'INSUFFICIENT_EVIDENCE',
  'REFERENCE_UNAVAILABLE',
];
const EXPIRY_STATUSES = ['EXPIRED', 'NOT_EXPIRED', 'UNKNOWN'];
const FIELD_MATCHES = ['MATCH', 'MISMATCH', 'UNKNOWN'];
const LOOKUP_MODES = ['LIVE_OFFICIAL', 'DEMO_FIXTURE', 'NOT_EXECUTED'];
const EXTRACTED_TEXT_FIELDS = [
  'category', 'productName', 'brand', 'nafdacNumber', 'manufacturer',
  'strength', 'batchNumber', 'manufacturingDate', 'expiryDate',
];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNullableString(value: unknown): boolean {
  return typeof value === 'string' || value === null;
}

function isOptionalText(value: unknown): boolean {
  return value === undefined || isNullableString(value);
}

function isStringArray(value: unknown): boolean {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

export function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  return isObject(value) && isObject(value.error)
    && typeof value.error.code === 'string'
    && typeof value.error.retryable === 'boolean';
}

function isMedicineRecord(value: unknown): boolean {
  return isObject(value)
    && typeof value.productName === 'string'
    && typeof value.nafdacNumber === 'string'
    && isNullableString(value.manufacturer)
    && isNullableString(value.strength)
    && isStringArray(value.ingredients)
    && isNullableString(value.registrationExpiry)
    && [value.applicant, value.listedManufacturer, value.manufacturerCountry, value.composition, value.atcCode, value.marketingCategory, value.packSize, value.registrationStatus, value.productCategory, value.dosageForm, value.route, value.approvalDate].every(isOptionalText);
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
      return isMedicineRecord(value.record) && (live || fixture);
    case 'NOT_FOUND':
      return value.record === null && live;
    case 'SOURCE_UNAVAILABLE':
      return value.record === null && authoritative === false && LOOKUP_MODES.includes(mode as string);
    default:
      return false;
  }
}

function isFinding(value: unknown): boolean {
  return isObject(value)
    && typeof value.code === 'string'
    && typeof value.field === 'string'
    && typeof value.explanation === 'string'
    && FIELD_MATCHES.includes(value.status as string)
    && isNullableString(value.packagingValue)
    && isNullableString(value.referenceValue);
}

export function isAnalysisResponse(value: unknown): value is AnalysisResponse {
  if (!isObject(value) || !isObject(value.extracted) || !isObject(value.verification)) return false;
  const { verification, extracted, reference } = value;

  if (!isStringArray(extracted.ingredients)) return false;
  if (!EXTRACTED_TEXT_FIELDS.every((field) => isNullableString(extracted[field]))) return false;
  if (![extracted.dosageForm, extracted.packSize, extracted.directions, extracted.storage].every(isOptionalText)) return false;
  if (extracted.printedWarnings !== undefined && !isStringArray(extracted.printedWarnings)) return false;
  if (verification.physicalAuthenticityConfirmed !== false) return false;
  if (!VERIFICATION_STATUSES.includes(verification.status as string)) return false;
  if (!EXPIRY_STATUSES.includes(verification.packageExpiryStatus as string)) return false;
  if (!EXPIRY_STATUSES.includes(verification.registrationExpiryStatus as string)) return false;
  if (typeof verification.summary !== 'string') return false;
  if (!Array.isArray(verification.findings) || !verification.findings.every(isFinding)) return false;
  if (!isStringArray(verification.recommendedActions)) return false;
  if (reference !== null && !isReferenceLookupResult(reference)) return false;

  // A verdict must agree with the lookup it claims to come from.
  const lookup = isReferenceLookupResult(reference) ? reference.status : null;
  if (verification.status === 'RECORD_NOT_FOUND' && lookup !== 'NOT_FOUND') return false;
  if (verification.status === 'REGISTRATION_DETAILS_MATCH' && lookup !== 'FOUND') return false;
  if (verification.status === 'DETAILS_MISMATCH' && lookup !== 'FOUND') return false;

  return true;
}
