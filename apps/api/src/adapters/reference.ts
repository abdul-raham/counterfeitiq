import type { MedicineReference, ReferenceLookupResult } from '@counterfeitiq/shared';
import { normalizeNafdacNumber } from '../services/normalize';

// Fictional records only. A real registration number must never appear here,
// because its details would be invented and could be mistaken for official data.
const DEMO_FIXTURES: Record<string, MedicineReference> = {
  A1123456: {
    productName: 'Example Medicine',
    nafdacNumber: 'A1-123456',
    manufacturer: 'Example Pharma Ltd',
    strength: '500 mg',
    ingredients: ['Exampleol'],
    registrationExpiry: '2028-03-14',
    retrievedAt: '2026-10-31T00:00:00.000Z',
  },
};

export interface LookupOptions {
  mode?: 'demo' | 'authorized_live';
  now?: () => Date;
}

export interface ReferenceAdapter {
  lookupMedicine(nafdacNumber: string): Promise<ReferenceLookupResult>;
}

export type ReferenceMode = NonNullable<LookupOptions['mode']>;

export function createReferenceAdapter(
  options: LookupOptions = {},
): ReferenceAdapter {
  return {
    lookupMedicine: (nafdacNumber: string) => lookupMedicine(nafdacNumber, options),
  };
}

export async function lookupMedicine(
  nafdacNumber: string,
  options: LookupOptions = {},
): Promise<ReferenceLookupResult> {
  const normalized = normalizeNafdacNumber(nafdacNumber);
  const requestedAt = (options.now?.() ?? new Date()).toISOString();

  if (!normalized) {
    return {
      status: 'SOURCE_UNAVAILABLE',
      record: null,
      provenance: {
        source: 'NONE',
        mode: 'NOT_EXECUTED',
        authoritative: false,
        requestedAt: null,
        note: 'Invalid or missing NAFDAC registration number.',
      },
    };
  }

  // No permitted live Greenbook integration exists yet. Until one does, live mode
  // reports that nothing was checked instead of serving fixtures or inventing results.
  if (options.mode === 'authorized_live') {
    return {
      status: 'SOURCE_UNAVAILABLE',
      record: null,
      provenance: {
        source: 'NONE',
        mode: 'NOT_EXECUTED',
        authoritative: false,
        requestedAt: null,
        note: 'Live NAFDAC lookup is not available yet.',
      },
    };
  }

  const fixture = DEMO_FIXTURES[normalized];
  if (fixture) {
    return {
      status: 'FOUND',
      record: fixture,
      provenance: {
        source: 'DEMO_FIXTURE',
        mode: 'DEMO_FIXTURE',
        authoritative: false,
        requestedAt,
        note: 'Fictional demo fixture for evaluation and demonstration.',
      },
    };
  }

  // A fixture miss says nothing about NAFDAC, so it can never be NOT_FOUND.
  return {
    status: 'SOURCE_UNAVAILABLE',
    record: null,
    provenance: {
      source: 'DEMO_FIXTURE',
      mode: 'DEMO_FIXTURE',
      authoritative: false,
      requestedAt,
      note: 'Live NAFDAC lookup requires explicit authorization.',
    },
  };
}
