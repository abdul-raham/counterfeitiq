import type { MedicineReference, ReferenceLookupResult } from '@counterfeitiq/shared';
import { canonicalNafdacNumber, INVALID_NUMBER_NOTE, notExecuted } from '../../../api/src/adapters/contract';
import { normalizeProductName } from '../../../api/src/services/normalize';
import { toProvenance, type ProductQuery, type ReferenceSource, type SearchResult } from './index';

const RETRIEVED_AT = '2026-10-31T00:00:00.000Z';
const NOTE = 'Fictional demo fixture. Not a NAFDAC record.';

// Fictional records only. The DEMO- prefix cannot be a real NAFDAC number, and the
// demo-cases images print the same numbers.
export const DEMO_RECORDS: readonly MedicineReference[] = [
  {
    productName: 'Demozol 500 mg Tablets', nafdacNumber: 'DEMO-0101', manufacturer: 'Fictional Labs Nigeria Ltd',
    strength: '500 mg', ingredients: ['Demozolamine'], registrationExpiry: '2029-01-31', retrievedAt: RETRIEVED_AT,
    dosageForm: 'Tablet', registrationStatus: 'Active', applicant: 'Fictional Labs Nigeria Ltd',
  },
  {
    productName: 'Demozol 250 mg Tablets', nafdacNumber: 'DEMO-0102', manufacturer: 'Fictional Labs Nigeria Ltd',
    strength: '250 mg', ingredients: ['Demozolamine'], registrationExpiry: '2029-01-31', retrievedAt: RETRIEVED_AT,
    dosageForm: 'Tablet', registrationStatus: 'Active', applicant: 'Fictional Labs Nigeria Ltd',
  },
  {
    productName: 'Placebrin Syrup', nafdacNumber: 'DEMO-0201', manufacturer: 'Imaginary Pharmaceuticals Plc',
    strength: '125 mg/5 ml', ingredients: ['Placebrinate'], registrationExpiry: '2028-06-30', retrievedAt: RETRIEVED_AT,
    dosageForm: 'Syrup', registrationStatus: 'Active', applicant: 'Imaginary Pharmaceuticals Plc',
  },
  {
    productName: 'Examplin 100 mg Capsules', nafdacNumber: 'DEMO-0301', manufacturer: 'Sample Remedies Ltd',
    strength: '100 mg', ingredients: ['Exampline'], registrationExpiry: '2029-01-31', retrievedAt: RETRIEVED_AT,
    dosageForm: 'Capsule', registrationStatus: 'Active', applicant: 'Sample Remedies Ltd',
  },
  {
    productName: 'Examplin Cream', nafdacNumber: 'DEMO-0302', manufacturer: 'Sample Remedies Ltd',
    strength: '1%', ingredients: ['Exampline'], registrationExpiry: '2029-01-31', retrievedAt: RETRIEVED_AT,
    dosageForm: 'Cream', registrationStatus: 'Active', applicant: 'Sample Remedies Ltd',
  },
  {
    productName: 'Demowater Table Water 75 cl', nafdacNumber: 'DEMO-0401', manufacturer: 'Imaginary Springs Ltd',
    strength: null, ingredients: [], registrationExpiry: '2029-01-31', retrievedAt: RETRIEVED_AT,
    dosageForm: 'Bottled water', registrationStatus: 'Active', applicant: 'Imaginary Springs Ltd',
  },
];

export function createDemoSource(now: () => Date = () => new Date()): ReferenceSource {
  const provenance = (requestedAt: string) => ({
    source: 'DEMO_FIXTURE', mode: 'DEMO_FIXTURE', authoritative: false, requestedAt, note: NOTE,
  } as const);

  return {
    async lookup(nafdacNumber): Promise<ReferenceLookupResult> {
      const number = canonicalNafdacNumber(nafdacNumber);
      if (!number) return notExecuted(INVALID_NUMBER_NOTE);
      const requestedAt = now().toISOString();
      const record = DEMO_RECORDS.find((item) => item.nafdacNumber === number);
      if (record) return { status: 'FOUND', record, provenance: provenance(requestedAt) };
      // A fixture miss says nothing about NAFDAC, so it can never be NOT_FOUND.
      return {
        status: 'SOURCE_UNAVAILABLE',
        record: null,
        provenance: { ...provenance(requestedAt), note: 'Demonstration mode: this number was not checked against NAFDAC.' },
      };
    },

    async search(query: ProductQuery): Promise<SearchResult> {
      const names = [query.productName, query.brandName].map(normalizeProductName).filter(Boolean);
      const records = DEMO_RECORDS.filter((record) => names.includes(normalizeProductName(record.productName)));
      const lookup: ReferenceLookupResult = {
        status: 'SOURCE_UNAVAILABLE', record: null, provenance: provenance(now().toISOString()),
      };
      return { supported: true, records, provenance: toProvenance(lookup) };
    },
  };
}
