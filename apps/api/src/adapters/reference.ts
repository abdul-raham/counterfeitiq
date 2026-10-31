import type { MedicineReference, ReferenceLookupResult } from '@counterfeitiq/shared';
import { normalizeNafdacNumber } from '../services/normalize';
import { INVALID_NUMBER_NOTE, notExecuted, type ReferenceAdapter } from './contract';
import { createGreenbookAdapter, type GreenbookOptions } from './greenbook';

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

export type { ReferenceAdapter } from './contract';

export interface ReferenceOptions {
  /** REFERENCE_MODE: "demo" (the default) or "authorized_live". */
  mode?: string;
  /** Where NAFDAC's permission is recorded. Greenbook requests stay off without it. */
  greenbookAccessApproval?: string;
  greenbook?: GreenbookOptions;
  now?: () => Date;
}

function createFixtureAdapter(now: () => Date): ReferenceAdapter {
  return {
    async lookupMedicine(nafdacNumber: string): Promise<ReferenceLookupResult> {
      const normalized = normalizeNafdacNumber(nafdacNumber);
      if (!normalized) return notExecuted(INVALID_NUMBER_NOTE);

      const requestedAt = now().toISOString();
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
          note: 'Demonstration mode: this number was not checked against NAFDAC.',
        },
      };
    },
  };
}

function refusingAdapter(note: string): ReferenceAdapter {
  return { lookupMedicine: async () => notExecuted(note) };
}

export function createReferenceAdapter(options: ReferenceOptions = {}): ReferenceAdapter {
  const mode = options.mode?.trim().toLowerCase() || 'demo';
  if (mode === 'demo') return createFixtureAdapter(options.now ?? (() => new Date()));
  // Anything else fails closed: a typo must not quietly serve demo data.
  if (mode !== 'authorized_live') return refusingAdapter('The registration source is not configured.');
  if (!options.greenbookAccessApproval?.trim()) {
    return refusingAdapter('Live NAFDAC lookup is not enabled.');
  }
  return createGreenbookAdapter(options.greenbook);
}
