import type { AnalysisResponse, ExtractedProduct, MedicineReference, ReferenceLookupResult } from '@counterfeitiq/shared';

export const extracted: ExtractedProduct = {
  category: 'medicine',
  productName: 'Example Medicine',
  brand: null,
  nafdacNumber: 'A1-123456',
  manufacturer: 'Example Pharma',
  strength: '500 mg',
  ingredients: [],
  batchNumber: null,
  manufacturingDate: null,
  expiryDate: '2027-06',
};

export const record: MedicineReference = {
  productName: 'Example Medicine',
  nafdacNumber: 'A1-123456',
  manufacturer: 'Example Pharma',
  strength: '250 mg',
  ingredients: [],
  registrationExpiry: '2028-03-14',
  retrievedAt: '2026-10-30T09:00:00.000Z',
};

const requestedAt = '2026-10-30T09:00:00.000Z';

export const live = { source: 'NAFDAC_GREENBOOK', mode: 'LIVE_OFFICIAL', authoritative: true, requestedAt } as const;
export const fixture = { source: 'DEMO_FIXTURE', mode: 'DEMO_FIXTURE', authoritative: false, requestedAt } as const;
export const notExecuted = { source: 'NONE', mode: 'NOT_EXECUTED', authoritative: false, requestedAt: null } as const;

export const foundLive: ReferenceLookupResult = { status: 'FOUND', record, provenance: live };
export const foundFixture: ReferenceLookupResult = { status: 'FOUND', record, provenance: fixture };
export const notFound: ReferenceLookupResult = { status: 'NOT_FOUND', record: null, provenance: live };
export const unavailable: ReferenceLookupResult = { status: 'SOURCE_UNAVAILABLE', record: null, provenance: notExecuted };

export function analysis(overrides: {
  extracted?: Partial<ExtractedProduct>;
  reference?: ReferenceLookupResult | null;
  verification?: Partial<AnalysisResponse['verification']>;
} = {}): AnalysisResponse {
  return {
    extracted: { ...extracted, ...overrides.extracted },
    reference: overrides.reference === undefined ? foundLive : overrides.reference,
    verification: {
      status: 'REGISTRATION_DETAILS_MATCH',
      categoryVerificationSupported: true,
      findings: [],
      summary: 'Backend summary.',
      recommendedActions: ['Ask a pharmacist.'],
      physicalAuthenticityConfirmed: false,
      packageExpiryStatus: 'NOT_EXPIRED',
      registrationExpiryStatus: 'NOT_EXPIRED',
      ...overrides.verification,
    },
  };
}
