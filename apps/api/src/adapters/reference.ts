import type { MedicineReference, ReferenceLookupResult } from '@counterfeitiq/shared';
import { normalizeNafdacNumber } from '../services/normalize';

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
  A6100103: {
    productName: 'Recombinant Hepatitis B Vaccine',
    nafdacNumber: 'A6-100103',
    manufacturer: 'Biological E. Limited',
    strength: '20 mcg/0.5 ml',
    ingredients: ['Hepatitis B Surface Antigen'],
    registrationExpiry: '2027-10-31',
    retrievedAt: '2026-10-31T00:00:00.000Z',
  },
};

export interface LookupOptions {
  mode?: 'demo' | 'authorized_live';
  now?: () => Date;
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

  // Simulated test numbers
  if (normalized === 'A1000000') {
    return {
      status: 'NOT_FOUND',
      record: null,
      provenance: {
        source: 'NAFDAC_GREENBOOK',
        mode: 'LIVE_OFFICIAL',
        authoritative: true,
        requestedAt,
      },
    };
  }

  if (normalized === 'A1999999') {
    return {
      status: 'SOURCE_UNAVAILABLE',
      record: null,
      provenance: {
        source: 'NONE',
        mode: 'NOT_EXECUTED',
        authoritative: false,
        requestedAt: null,
        note: 'Simulated source unavailability.',
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

  // Fallback for unregistered demo lookups
  return {
    status: 'SOURCE_UNAVAILABLE',
    record: null,
    provenance: {
      source: 'DEMO_FIXTURE',
      mode: 'DEMO_FIXTURE',
      authoritative: false,
      requestedAt,
      note: 'No matching demo fixture; live NAFDAC lookup requires explicit authorization.',
    },
  };
}
