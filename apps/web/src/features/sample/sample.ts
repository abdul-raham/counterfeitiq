import type { AnalysisResponse, ExtractedProduct, MedicineReference, ReferenceLookupResult } from '@counterfeitiq/shared';
import { RequestError } from '../../lib/errors';

// Every product, manufacturer and number in this file is fictional.
// This module is only loaded when VITE_USE_SAMPLE_DATA is 'true'.

const RETRIEVED_AT = '2026-10-30T09:00:00.000Z';

const pack: ExtractedProduct = {
  category: 'medicine',
  productName: 'Example Medicine',
  brand: 'Examplex',
  nafdacNumber: 'A1-123456',
  manufacturer: 'Example Pharma Ltd',
  strength: '500 mg',
  ingredients: ['Exampleol'],
  batchNumber: 'EX2041',
  manufacturingDate: '2025-06',
  expiryDate: '2027-06',
};

const record: MedicineReference = {
  productName: 'Example Medicine',
  nafdacNumber: 'A1-123456',
  manufacturer: 'Example Pharma Ltd',
  strength: '500 mg',
  ingredients: ['Exampleol'],
  registrationExpiry: '2028-03-14',
  retrievedAt: RETRIEVED_AT,
};

const fixtureProvenance = {
  source: 'DEMO_FIXTURE',
  mode: 'DEMO_FIXTURE',
  authoritative: false,
  requestedAt: RETRIEVED_AT,
  note: 'Fictional record used for demonstration.',
} as const;

const liveProvenance = {
  source: 'NAFDAC_GREENBOOK',
  mode: 'LIVE_OFFICIAL',
  authoritative: true,
  requestedAt: RETRIEVED_AT,
} as const;

const unavailableProvenance = {
  source: 'NONE',
  mode: 'NOT_EXECUTED',
  authoritative: false,
  requestedAt: null,
} as const;

function matchFinding(field: string, value: string) {
  return {
    code: `${field.toUpperCase()}_MATCH`,
    field,
    status: 'MATCH',
    severity: 'INFO',
    packagingValue: value,
    referenceValue: value,
    explanation: 'This matches the available reference value.',
  } as const;
}

const matchingFindings = [
  matchFinding('productName', 'Example Medicine'),
  matchFinding('nafdacNumber', 'A1-123456'),
  matchFinding('manufacturer', 'Example Pharma Ltd'),
  matchFinding('strength', '500 mg'),
];

const verificationBase = {
  categoryVerificationSupported: true,
  physicalAuthenticityConfirmed: false,
  packageExpiryStatus: 'NOT_EXPIRED',
  registrationExpiryStatus: 'NOT_EXPIRED',
} as const;

const unreadablePack: ExtractedProduct = {
  category: null,
  productName: null,
  brand: null,
  nafdacNumber: null,
  manufacturer: null,
  strength: null,
  ingredients: [],
  batchNumber: null,
  manufacturingDate: null,
  expiryDate: null,
};

const scenarios = {
  match: {
    label: 'Details match',
    response: {
      extracted: pack,
      reference: { status: 'FOUND', record, provenance: fixtureProvenance },
      verification: {
        ...verificationBase,
        status: 'REGISTRATION_DETAILS_MATCH',
        findings: matchingFindings,
        summary: 'The details we could read on this pack match the record.',
        recommendedActions: [
          'Buy medicines from a licensed pharmacy.',
          'Check that the seal is intact and the printing looks clean.',
        ],
      },
    },
  },
  mismatch: {
    label: 'Details differ',
    response: {
      extracted: { ...pack, strength: '250 mg', manufacturer: 'Exampel Pharma' },
      reference: { status: 'FOUND', record, provenance: fixtureProvenance },
      verification: {
        ...verificationBase,
        status: 'DETAILS_MISMATCH',
        findings: [
          matchFinding('productName', 'Example Medicine'),
          matchFinding('nafdacNumber', 'A1-123456'),
          {
            code: 'MANUFACTURER_MISMATCH', field: 'manufacturer', status: 'MISMATCH', severity: 'HIGH',
            packagingValue: 'Exampel Pharma', referenceValue: 'Example Pharma Ltd',
            explanation: 'The manufacturer on the pack differs from the record.',
          },
          {
            code: 'STRENGTH_MISMATCH', field: 'strength', status: 'MISMATCH', severity: 'HIGH',
            packagingValue: '250 mg', referenceValue: '500 mg',
            explanation: 'The strength on the pack differs from the record.',
          },
        ],
        summary: 'Two details on this pack differ from the record.',
        recommendedActions: [
          'Do not use this product until a pharmacist has checked it.',
          'Report the product to NAFDAC.',
        ],
      },
    },
  },
  expired: {
    label: 'Expired pack',
    response: {
      extracted: { ...pack, expiryDate: '2025-01' },
      reference: { status: 'FOUND', record, provenance: fixtureProvenance },
      verification: {
        ...verificationBase,
        status: 'REGISTRATION_DETAILS_MATCH',
        packageExpiryStatus: 'EXPIRED',
        findings: matchingFindings,
        summary: 'The details we could read match the record, but the printed expiry date has passed.',
        recommendedActions: ['Do not use this pack. Ask a pharmacist how to dispose of it safely.'],
      },
    },
  },
  notFound: {
    label: 'No record found',
    response: {
      extracted: { ...pack, nafdacNumber: 'A1-000000' },
      reference: { status: 'NOT_FOUND', record: null, provenance: liveProvenance },
      verification: {
        ...verificationBase,
        registrationExpiryStatus: 'UNKNOWN',
        status: 'RECORD_NOT_FOUND',
        findings: [],
        summary: 'The lookup finished and found no exact match for this NAFDAC number.',
        recommendedActions: [
          'Check the number on the pack and try the manual lookup.',
          'Ask a pharmacist or contact NAFDAC before using this product.',
        ],
      },
    },
  },
  unavailable: {
    label: 'Source unavailable',
    response: {
      extracted: pack,
      reference: { status: 'SOURCE_UNAVAILABLE', record: null, provenance: unavailableProvenance },
      verification: {
        ...verificationBase,
        registrationExpiryStatus: 'UNKNOWN',
        status: 'REFERENCE_UNAVAILABLE',
        findings: [],
        summary: 'No registration source was checked.',
        recommendedActions: ['Try again later, or check the official NAFDAC source directly.'],
      },
    },
  },
  blurry: {
    label: 'Unreadable photo',
    response: {
      extracted: unreadablePack,
      reference: null,
      verification: {
        ...verificationBase,
        packageExpiryStatus: 'UNKNOWN',
        registrationExpiryStatus: 'UNKNOWN',
        status: 'INSUFFICIENT_EVIDENCE',
        findings: [],
        summary: 'Too little text could be read from this photo to compare anything.',
        recommendedActions: ['Take a sharper photo in good light, with the text filling the frame.'],
      },
    },
  },
  nonMedicine: {
    label: 'Not a medicine',
    response: {
      extracted: {
        ...unreadablePack,
        category: 'cosmetic',
        productName: 'Example Shea Lotion',
        brand: 'Examplex',
        nafdacNumber: 'B2-654321',
        expiryDate: '2027-11',
      },
      reference: null,
      verification: {
        ...verificationBase,
        categoryVerificationSupported: false,
        registrationExpiryStatus: 'UNKNOWN',
        status: 'INSUFFICIENT_EVIDENCE',
        findings: [],
        summary: 'We read this packaging, but our registration source only covers medicines.',
        recommendedActions: ['Check this product through official NAFDAC channels.'],
      },
    },
  },
} satisfies Record<string, { label: string; response: AnalysisResponse }>;

export type SampleScenario = keyof typeof scenarios | 'timeout';

export const sampleScenarioOptions: { value: SampleScenario; label: string }[] = [
  ...(Object.keys(scenarios) as (keyof typeof scenarios)[]).map((value) => ({ value, label: scenarios[value].label })),
  { value: 'timeout', label: 'Request times out' },
];

let currentScenario: SampleScenario = 'match';

export function getSampleScenario() {
  return currentScenario;
}

export function setSampleScenario(scenario: SampleScenario) {
  currentScenario = scenario;
}

function wait(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Cancelled', 'AbortError'));
    });
  });
}

export async function sampleAnalyze(signal?: AbortSignal): Promise<AnalysisResponse> {
  await wait(1800, signal);
  if (currentScenario === 'timeout') throw new RequestError('REQUEST_TIMEOUT', true);
  return scenarios[currentScenario].response;
}

export const sampleLookupNumbers = [
  { number: 'A1-123456', outcome: 'record found' },
  { number: 'A1-000000', outcome: 'no record' },
  { number: 'A1-999999', outcome: 'source unavailable' },
];

export async function sampleLookup(number: string, signal?: AbortSignal): Promise<ReferenceLookupResult> {
  await wait(900, signal);
  const normalized = number.trim().toUpperCase();
  if (normalized === 'A1-123456') return { status: 'FOUND', record, provenance: fixtureProvenance };
  if (normalized === 'A1-999999') return { status: 'SOURCE_UNAVAILABLE', record: null, provenance: unavailableProvenance };
  return { status: 'NOT_FOUND', record: null, provenance: liveProvenance };
}
