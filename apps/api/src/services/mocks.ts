import type { ExtractedProduct, ReferenceLookupResult } from '@counterfeitiq/shared';

export const mockExtractedMedicine = {
  category: 'medicine',
  productName: 'Example Medicine',
  brand: null,
  nafdacNumber: 'A1-000000',
  manufacturer: 'Example Pharma',
  strength: '500 mg',
  ingredients: [],
  batchNumber: null,
  manufacturingDate: null,
  expiryDate: '2027-06',
} satisfies ExtractedProduct;

export const mockLiveFound = {
  status: 'FOUND',
  record: {
    productName: 'Example Medicine',
    nafdacNumber: 'A1-000000',
    manufacturer: null,
    strength: '500 mg',
    ingredients: [],
    registrationExpiry: '2028-12-31',
    retrievedAt: '2026-10-31T00:00:00.000Z',
  },
  provenance: {
    source: 'NAFDAC_GREENBOOK',
    mode: 'LIVE_OFFICIAL',
    authoritative: true,
    requestedAt: '2026-10-31T00:00:00.000Z',
  },
} satisfies ReferenceLookupResult;

export const mockAuthoritativeNotFound = {
  status: 'NOT_FOUND',
  record: null,
  provenance: {
    source: 'NAFDAC_GREENBOOK',
    mode: 'LIVE_OFFICIAL',
    authoritative: true,
    requestedAt: '2026-10-31T00:00:00.000Z',
  },
} satisfies ReferenceLookupResult;

export const mockSourceUnavailable = {
  status: 'SOURCE_UNAVAILABLE',
  record: null,
  provenance: {
    source: 'NONE',
    mode: 'NOT_EXECUTED',
    authoritative: false,
    requestedAt: null,
    note: 'Typed development mock; no external request was executed.',
  },
} satisfies ReferenceLookupResult;
