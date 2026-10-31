import { isReferenceLookupResult } from '../validate';
import type { ResolveResponse } from '@counterfeitiq/shared/v3';

const IDENTIFIER_TYPES = ['GTIN', 'GS1_DATAMATRIX', 'SERIALIZED', 'UNKNOWN'];
const IDENTITY_LEVELS = ['PRODUCT', 'BATCH', 'PACK'];
const SOURCE_TYPES = ['DEMO_ERP', 'AUTHORIZED_ERP', 'REGULATORY_REFERENCE'];
const SOURCE_STATUSES = ['FOUND', 'NOT_FOUND', 'UNAVAILABLE'];
const SEVERITIES = ['INFO', 'WARNING', 'HIGH'];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isStringArray(value: unknown): boolean {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

// A record's source decides how it is labelled, so a reply with no recognised source, or a
// "found" with no product, is refused rather than shown as if it were real data.
export function isResolveResponse(value: unknown): value is ResolveResponse {
  if (!isObject(value) || !isObject(value.source)) return false;
  const { source, product, manufacturer, batch, pack, reference, scanSummary, warnings, limitations } = value;

  if (typeof value.identifier !== 'string' || !IDENTIFIER_TYPES.includes(value.identifierType as string)) return false;
  if (value.identityLevel !== null && !IDENTITY_LEVELS.includes(value.identityLevel as string)) return false;
  if (!SOURCE_TYPES.includes(source.type as string) || !SOURCE_STATUSES.includes(source.status as string)) return false;
  if (typeof source.name !== 'string' || typeof source.retrievedAt !== 'string') return false;

  if (source.status === 'FOUND') {
    if (!isObject(product) || typeof product.name !== 'string' || !isStringArray(product.activeIngredients)) return false;
    if (!isObject(manufacturer) || typeof manufacturer.name !== 'string') return false;
    if (!IDENTITY_LEVELS.includes(value.identityLevel as string)) return false;
  }
  if (batch !== null && !(isObject(batch) && typeof batch.batchNumber === 'string')) return false;
  if (pack !== null && !(isObject(pack) && typeof pack.serialNumber === 'string')) return false;
  if (reference !== null && !isReferenceLookupResult(reference)) return false;
  if (scanSummary !== null && !(isObject(scanSummary) && typeof scanSummary.previousScans === 'number' && typeof scanSummary.persistenceNote === 'string')) return false;
  if (!Array.isArray(warnings) || !warnings.every((item) => isObject(item) && typeof item.message === 'string' && SEVERITIES.includes(item.severity as string))) return false;
  return isStringArray(limitations);
}

const MAX_IDENTIFIER_LENGTH = 256;

/**
 * Tidies scanned or typed text for the server, which does the real parsing. Only GS, the
 * separator GS1 codes use, may remain as a control character. A scanned web address is treated
 * as text, so a code can never send someone to the site it names.
 */
export function cleanIdentifier(raw: string): string | null {
  const text = raw.trim();
  if (text.length < 4 || text.length > MAX_IDENTIFIER_LENGTH) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001c\u001e-\u001f\u007f]/.test(text)) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(text) && !/^https?:\/\//i.test(text)) return null;
  return text;
}
