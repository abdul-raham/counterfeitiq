import {
  isMedicineCategory,
  type ExtractedProduct,
  type InvestigationReport,
  type ReferenceLookupResult,
} from '@counterfeitiq/shared';
import { buildFindings } from './compare';
import { assessPackageExpiry, assessRegistrationExpiry } from './expiry';

export function buildInvestigation(
  extracted: ExtractedProduct,
  reference: ReferenceLookupResult | null,
  now = new Date(),
): InvestigationReport {
  const categorySupported = isMedicineCategory(extracted.category);
  const packageExpiryStatus = assessPackageExpiry(extracted.expiryDate, now);
  const registrationExpiryStatus = reference?.status === 'FOUND'
    ? assessRegistrationExpiry(reference.record.registrationExpiry, now)
    : 'UNKNOWN';

  const base = {
    categoryVerificationSupported: categorySupported,
    physicalAuthenticityConfirmed: false as const,
    packageExpiryStatus,
    registrationExpiryStatus,
  };

  if (!categorySupported) {
    return {
      ...base, status: 'INSUFFICIENT_EVIDENCE', findings: [],
      summary: 'Registration verification is not supported for this product category.',
      recommendedActions: ['Use the regulator or reference source appropriate for this product category.'],
    };
  }

  if (!extracted.nafdacNumber?.trim()) {
    return {
      ...base, status: 'INSUFFICIENT_EVIDENCE', findings: [],
      summary: 'No readable NAFDAC registration number was available for lookup.',
      recommendedActions: ['Capture a clearer image showing the registration number.'],
    };
  }

  if (!reference || reference.status === 'SOURCE_UNAVAILABLE') {
    return {
      ...base, status: 'REFERENCE_UNAVAILABLE', findings: [],
      summary: 'The medicine registration source could not provide an authoritative result.',
      recommendedActions: ['Check the official NAFDAC source directly and try again later.'],
    };
  }

  if (reference.status === 'NOT_FOUND') {
    return {
      ...base, status: 'RECORD_NOT_FOUND', findings: [],
      summary: 'The completed official lookup did not find an exact registration record.',
      recommendedActions: ['Confirm the number printed on the package and check the official source directly.'],
    };
  }

  const findings = buildFindings(extracted, reference.record);
  const mismatches = findings.filter((finding) => finding.status === 'MISMATCH');
  const unknowns = findings.filter((finding) => finding.status === 'UNKNOWN');
  const fixtureNote = reference.provenance.mode === 'DEMO_FIXTURE'
    ? ' This comparison uses a demo fixture, not a live official lookup.'
    : '';

  if (mismatches.length) {
    return {
      ...base, status: 'DETAILS_MISMATCH', findings,
      summary: `One or more package details differ from the reference.${fixtureNote}`,
      recommendedActions: ['Do not rely on this comparison alone; contact NAFDAC or the manufacturer.'],
    };
  }

  if (unknowns.length) {
    return {
      ...base, status: 'INSUFFICIENT_EVIDENCE', findings,
      summary: `Available details match, but some fields could not be compared.${fixtureNote}`,
      recommendedActions: ['Review the unknown fields and capture a clearer package image.'],
    };
  }

  return {
    ...base, status: 'REGISTRATION_DETAILS_MATCH', findings,
    summary: `Package details match the available registration record. This does not confirm physical authenticity.${fixtureNote}`,
    recommendedActions: ['Inspect package integrity and purchase only from a trusted seller.'],
  };
}
