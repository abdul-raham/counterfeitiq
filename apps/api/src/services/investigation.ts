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
  const expiryWarnings: string[] = [];
  const expiryActions: string[] = [];
  if (packageExpiryStatus === 'EXPIRED') {
    expiryWarnings.push('The printed package expiry has passed.');
    expiryActions.push('Do not use a package after its printed expiry; consult a pharmacist or appropriate professional.');
  }
  if (registrationExpiryStatus === 'EXPIRED') {
    expiryWarnings.push('The regulatory registration expiry in the reference has passed.');
    expiryActions.push('Confirm the current registration status directly with NAFDAC.');
  }
  const expirySummary = expiryWarnings.length ? ` ${expiryWarnings.join(' ')}` : '';

  const base = {
    categoryVerificationSupported: categorySupported,
    physicalAuthenticityConfirmed: false as const,
    packageExpiryStatus,
    registrationExpiryStatus,
  };

  if (!extracted.category?.trim()) {
    return {
      ...base, status: 'INSUFFICIENT_EVIDENCE', findings: [],
      summary: `The product category could not be read from the image.${expirySummary}`,
      recommendedActions: ['Capture a clearer image showing the product label.', ...expiryActions],
    };
  }

  if (!categorySupported) {
    return {
      ...base, status: 'INSUFFICIENT_EVIDENCE', findings: [],
      summary: `Registration verification is not supported for this product category.${expirySummary}`,
      recommendedActions: ['Use the regulator or reference source appropriate for this product category.', ...expiryActions],
    };
  }

  if (!extracted.nafdacNumber?.trim()) {
    return {
      ...base, status: 'INSUFFICIENT_EVIDENCE', findings: [],
      summary: `No readable NAFDAC registration number was available for lookup.${expirySummary}`,
      recommendedActions: ['Capture a clearer image showing the registration number.', ...expiryActions],
    };
  }

  if (!reference || reference.status === 'SOURCE_UNAVAILABLE') {
    return {
      ...base, status: 'REFERENCE_UNAVAILABLE', findings: [],
      summary: `The medicine registration source could not provide an authoritative result.${expirySummary}`,
      recommendedActions: ['Check the official NAFDAC source directly and try again later.', ...expiryActions],
    };
  }

  if (reference.status === 'NOT_FOUND') {
    return {
      ...base, status: 'RECORD_NOT_FOUND', findings: [],
      summary: `The completed official lookup did not find an exact registration record.${expirySummary}`,
      recommendedActions: ['Confirm the number printed on the package and check the official source directly.', ...expiryActions],
    };
  }

  const findings = buildFindings(extracted, reference.record);
  const mismatches = findings.filter((finding) => finding.status === 'MISMATCH');
  const unknowns = findings.filter((finding) => finding.status === 'UNKNOWN');
  const registrationNumberMatched = findings.some(
    (finding) => finding.field === 'nafdacNumber' && finding.status === 'MATCH',
  );
  const coreClaimMatched = findings.some(
    (finding) => ['productName', 'manufacturer', 'strength', 'ingredients'].includes(finding.field)
      && finding.status === 'MATCH',
  );
  const fixtureNote = reference.provenance.mode === 'DEMO_FIXTURE'
    ? ' This comparison uses a demo fixture, not a live official lookup.'
    : '';

  if (mismatches.length) {
    return {
      ...base, status: 'DETAILS_MISMATCH', findings,
      summary: `One or more package details differ from the reference.${fixtureNote}${expirySummary}`,
      recommendedActions: ['Do not rely on this comparison alone; contact NAFDAC or the manufacturer.', ...expiryActions],
    };
  }

  if (!registrationNumberMatched || !coreClaimMatched) {
    return {
      ...base, status: 'INSUFFICIENT_EVIDENCE', findings,
      summary: `There was not enough matching core evidence to compare the package with confidence.${fixtureNote}${expirySummary}`,
      recommendedActions: ['Review the unknown fields and capture a clearer package image.', ...expiryActions],
    };
  }

  if (unknowns.length) {
    return {
      ...base, status: 'REGISTRATION_DETAILS_MATCH', findings,
      summary: `The registration number and available core details match, but some fields were unavailable. This does not confirm physical authenticity.${fixtureNote}${expirySummary}`,
      recommendedActions: ['Some details could not be compared. Treat them as unknown, not as matches.', ...expiryActions],
    };
  }

  return {
    ...base, status: 'REGISTRATION_DETAILS_MATCH', findings,
    summary: `Package details match the available registration record. This does not confirm physical authenticity.${fixtureNote}${expirySummary}`,
    recommendedActions: ['Inspect package integrity and purchase only from a trusted seller.', ...expiryActions],
  };
}
