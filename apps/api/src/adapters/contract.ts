import type { ReferenceLookupResult } from '@counterfeitiq/shared';

// Every provider implements this, so switching provider changes nothing for the
// routes, the verification engine or the frontend.
export interface ReferenceAdapter {
  lookupMedicine(nafdacNumber: string): Promise<ReferenceLookupResult>;
}

const LABEL_PREFIX = /^(?:NAFDAC\s*(?:REG(?:ISTRATION)?\.?)?\s*(?:NO\.?|NUMBER)?|REG(?:ISTRATION)?\.?\s*(?:NO\.?|NUMBER))\s*[:.-]?\s*/;

/**
 * Canonical form of a registration number. Hyphens stay significant, because
 * A1-123456 and A11-23456 are different numbers. A label and letter case are not.
 */
export function canonicalNafdacNumber(value: string): string | null {
  const number = value
    .normalize('NFKC')
    .toUpperCase()
    .trim()
    .replace(/[‐-―−]/g, '-')
    .replace(LABEL_PREFIX, '')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s/, '-');
  if (!number || number.length > 20) return null;
  return /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(number) && /\d/.test(number) ? number : null;
}

export const INVALID_NUMBER_NOTE = 'Invalid or missing NAFDAC registration number.';

/** No registry was contacted, so the answer says nothing about the product. */
export function notExecuted(note: string): ReferenceLookupResult {
  return {
    status: 'SOURCE_UNAVAILABLE',
    record: null,
    provenance: {
      source: 'NONE',
      mode: 'NOT_EXECUTED',
      authoritative: false,
      requestedAt: null,
      note,
    },
  };
}
