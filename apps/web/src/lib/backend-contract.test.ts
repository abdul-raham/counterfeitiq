import type { AnalysisResponse, ExtractedProduct, ReferenceLookupResult } from '@counterfeitiq/shared';
import { describe, expect, it } from 'vitest';
import { buildInvestigation } from '../../../api/src/services/investigation';
import {
  mockAuthoritativeNotFound,
  mockExtractedMedicine,
  mockLiveFound,
  mockSourceUnavailable,
} from '../../../api/src/services/mocks';
import { describeOutcome } from '../features/report/outcome';
import { isAnalysisResponse } from './validate';

const NOW = new Date('2026-10-31T00:00:00.000Z');

function respond(extracted: ExtractedProduct, reference: ReferenceLookupResult | null): AnalysisResponse {
  return { extracted, reference, verification: buildInvestigation(extracted, reference, NOW) };
}

const medicine: ExtractedProduct = mockExtractedMedicine;

// Runs the real backend logic through the frontend's guards, so a change on
// either side that would make every report fail is caught here.
describe('real backend output', () => {
  it.each<[string, AnalysisResponse, AnalysisResponse['verification']['status'], string]>([
    ['match', respond(medicine, mockLiveFound), 'REGISTRATION_DETAILS_MATCH', 'Registration details match'],
    ['mismatch', respond({ ...medicine, strength: '250 mg' }, mockLiveFound), 'DETAILS_MISMATCH', 'Some details differ from the registration record'],
    ['not found', respond(medicine, mockAuthoritativeNotFound), 'RECORD_NOT_FOUND', 'No registration record found'],
    ['unavailable', respond(medicine, mockSourceUnavailable), 'REFERENCE_UNAVAILABLE', 'Registration records could not be checked'],
    ['no number', respond({ ...medicine, nafdacNumber: null }, null), 'INSUFFICIENT_EVIDENCE', 'No NAFDAC number could be read'],
    ['non-medicine', respond({ ...medicine, category: 'cosmetic' }, null), 'INSUFFICIENT_EVIDENCE', 'Registration check is not available for this product type'],
    ['unread category', respond({ ...medicine, category: null }, null), 'INSUFFICIENT_EVIDENCE', 'We could not tell what type of product this is'],
  ])('%s is accepted and described correctly', (_name, response, status, title) => {
    expect(response.verification.status).toBe(status);
    expect(isAnalysisResponse(response)).toBe(true);
    expect(describeOutcome(response).title).toBe(title);
  });
});
