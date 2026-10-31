import type { ReferenceLookupResult } from '@counterfeitiq/shared';

// Every provider implements this, so switching provider changes nothing for the
// routes, the verification engine or the frontend.
export interface ReferenceAdapter {
  lookupMedicine(nafdacNumber: string): Promise<ReferenceLookupResult>;
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
