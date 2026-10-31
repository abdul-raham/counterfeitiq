import type { MedicineReference, ReferenceLookupResult } from '@counterfeitiq/shared';

// Fictional records only. A real registration number must never appear here,
// because its details would be invented and could be mistaken for official data.
const DEMO_FIXTURES = new Map<string, MedicineReference>([
  ['A1-123456', {
    productName: 'Example Medicine',
    nafdacNumber: 'A1-123456',
    manufacturer: 'Example Pharma Ltd',
    strength: '500 mg',
    ingredients: ['Exampleol'],
    registrationExpiry: '2028-03-14',
    retrievedAt: '2026-10-31T00:00:00.000Z',
  }],
]);

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

export interface LookupOptions {
  mode?: 'demo' | 'authorized_live';
  now?: () => Date;
}

export async function lookupMedicine(
  nafdacNumber: string,
  options: LookupOptions = {},
): Promise<ReferenceLookupResult> {
  const normalized = canonicalNafdacNumber(nafdacNumber);
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

  const fixture = DEMO_FIXTURES.get(normalized);
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
