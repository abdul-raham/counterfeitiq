import {
  isMedicineCategory,
  type ExtractedProduct,
  type MedicineReference,
  type ReferenceLookupResult,
  type VerificationFinding,
  type VerificationStatus,
} from '@counterfeitiq/shared';
import { canonicalNafdacNumber, notExecuted } from '../../api/src/adapters/contract';
import { compareProduct } from '../../api/src/services/compare';
import { assessPackageExpiry, assessRegistrationExpiry } from '../../api/src/services/expiry';
import { NOTICE, type CompareResponse, type Extraction, type FieldName, type PackagingNote } from './contract';
import { compareDosageForms, compareManufacturers, compareStrengths, type Comparison } from './normalize';
import { toProvenance, type ReferenceSource } from './sources';

function flatten(extraction: Extraction): ExtractedProduct {
  const value = (name: FieldName) => extraction.fields[name].value;
  return {
    category: extraction.category,
    productName: value('productName'),
    brand: value('brandName'),
    nafdacNumber: value('nafdacNumber'),
    manufacturer: value('manufacturer'),
    strength: value('strength'),
    ingredients: extraction.activeIngredients,
    batchNumber: value('batchNumber'),
    manufacturingDate: value('manufacturingDate'),
    expiryDate: value('expiryDate'),
    dosageForm: value('dosageForm'),
  };
}

function restated(finding: VerificationFinding, status: Comparison, label: string): VerificationFinding {
  return {
    ...finding,
    code: `${finding.field.toUpperCase()}_${status}`,
    status,
    severity: status === 'MISMATCH' ? 'HIGH' : 'INFO',
    explanation: status === 'MATCH' ? `${label} matches the available reference value.`
      : status === 'MISMATCH' ? `${label} differs from the available reference value.`
        : `${label} could not be confirmed from the available values.`,
  };
}

export function compareFields(extraction: Extraction, record: MedicineReference): VerificationFinding[] {
  const product = flatten(extraction);
  const findings = compareProduct(product, record).map((finding) => {
    if (finding.field === 'nafdacNumber') {
      // compareProduct drops hyphens, which would equate A11-23456 with A1-123456.
      const pack = product.nafdacNumber ? canonicalNafdacNumber(product.nafdacNumber) : null;
      const listed = canonicalNafdacNumber(record.nafdacNumber);
      const status = !pack || !listed ? 'UNKNOWN' : pack === listed ? 'MATCH' : 'MISMATCH';
      return restated(finding, status, 'NAFDAC registration number');
    }
    if (finding.field === 'productName' && finding.status !== 'MATCH' && product.brand) {
      const byBrand = compareProduct({ ...product, productName: product.brand }, record)
        .find((item) => item.field === 'productName');
      return byBrand?.status === 'MATCH' ? byBrand : finding;
    }
    if (finding.field === 'manufacturer') {
      return restated(finding, compareManufacturers(product.manufacturer, record.manufacturer), 'Manufacturer');
    }
    if (finding.field === 'strength') {
      return restated(finding, compareStrengths(product.strength, record.strength), 'Strength');
    }
    return finding;
  });

  findings.push(restated({
    code: '', field: 'dosageForm', status: 'UNKNOWN', severity: 'INFO', explanation: '',
    packagingValue: product.dosageForm ?? null, referenceValue: record.dosageForm ?? null,
  }, compareDosageForms(product.dosageForm ?? null, record.dosageForm ?? null), 'Dosage form'));

  // A character misread from a poor photo must not read as a discrepancy on the pack.
  return findings.map((finding) => {
    const field = extraction.fields[finding.field as FieldName] as Extraction['fields'][FieldName] | undefined;
    if (finding.status !== 'MISMATCH' || field?.legibility !== 'UNCERTAIN') return finding;
    return {
      ...finding,
      code: `${finding.field.toUpperCase()}_NEEDS_CLEARER_PHOTO`,
      status: 'UNKNOWN',
      severity: 'WARNING',
      explanation: 'This value differs from the reference, but it was hard to read. Check the pack or retake the photo.',
    };
  });
}

function packagingNotes(extraction: Extraction, lookup: ReferenceLookupResult | null, now: Date): PackagingNote[] {
  const notes: PackagingNote[] = [];
  const { nafdacNumber, expiryDate, manufacturingDate } = extraction.fields;
  if (!nafdacNumber.value) {
    notes.push({ code: 'MISSING_PRODUCT_IDENTIFIER', severity: 'WARNING', explanation: 'No clear NAFDAC registration number was read from the photo.' });
  }
  for (const [code, field] of [['EXPIRY_DATE_REQUIRES_INSPECTION', expiryDate], ['MANUFACTURING_DATE_REQUIRES_INSPECTION', manufacturingDate]] as const) {
    if (!field.value && field.evidence) {
      notes.push({ code, severity: 'WARNING', explanation: `A date was printed but could not be read reliably ("${field.evidence}"). Check it on the pack.` });
    }
  }
  // Compared as text, which is safe for ISO dates of equal length.
  if (expiryDate.value && manufacturingDate.value && expiryDate.value.length === manufacturingDate.value.length
    && expiryDate.value <= manufacturingDate.value) {
    notes.push({ code: 'PACKAGING_DATES_INCONSISTENT', severity: 'WARNING', explanation: 'The printed expiry date is not after the manufacturing date.' });
  }
  if (assessPackageExpiry(expiryDate.value, now) === 'EXPIRED') {
    notes.push({ code: 'PACKAGE_EXPIRED', severity: 'WARNING', explanation: 'The expiry date printed on this pack has passed.' });
  }
  if (lookup?.status === 'FOUND') {
    if (assessRegistrationExpiry(lookup.record.registrationExpiry, now) === 'EXPIRED') {
      notes.push({ code: 'REGISTRATION_EXPIRED', severity: 'WARNING', explanation: 'The registration expiry in the reference has passed. This is separate from the expiry date printed on the pack.' });
    }
    const status = lookup.record.registrationStatus;
    if (status && status.toLowerCase() !== 'active') {
      notes.push({ code: 'REGISTRATION_NOT_ACTIVE', severity: 'WARNING', explanation: `The reference lists this registration as "${status}".` });
    }
  }
  return notes;
}

export function overallStatus(findings: VerificationFinding[]): VerificationStatus {
  if (findings.some((finding) => finding.status === 'MISMATCH')) return 'DETAILS_MISMATCH';
  const matched = (field: string) => findings.some((finding) => finding.field === field && finding.status === 'MATCH');
  return matched('nafdacNumber') && ['productName', 'manufacturer', 'strength', 'ingredients'].some(matched)
    ? 'REGISTRATION_DETAILS_MATCH'
    : 'INSUFFICIENT_EVIDENCE';
}

/**
 * Field-by-field comparison with no model involved. The reference is always looked up
 * here, so a caller cannot supply the record or its provenance.
 */
export async function comparePackaging(
  extraction: Extraction,
  source: ReferenceSource,
  selectedNafdacNumber?: string,
  now = new Date(),
): Promise<CompareResponse> {
  const respond = (status: VerificationStatus, lookup: ReferenceLookupResult, findings: VerificationFinding[]): CompareResponse => ({
    status,
    findings,
    packagingNotes: packagingNotes(extraction, lookup, now),
    provenance: toProvenance(lookup),
    physicalAuthenticityConfirmed: false,
    notice: NOTICE,
  });

  if (extraction.category !== null && !isMedicineCategory(extraction.category)) {
    return respond('INSUFFICIENT_EVIDENCE', notExecuted('No reference applies to this category.'), []);
  }
  const number = selectedNafdacNumber ?? extraction.fields.nafdacNumber.value;
  if (!number) return respond('INSUFFICIENT_EVIDENCE', notExecuted('No registration number was available to look up.'), []);

  const lookup = await source.lookup(number);
  if (lookup.status === 'NOT_FOUND') return respond('RECORD_NOT_FOUND', lookup, []);
  if (lookup.status === 'SOURCE_UNAVAILABLE') return respond('REFERENCE_UNAVAILABLE', lookup, []);

  const findings = compareFields(extraction, lookup.record);
  return respond(overallStatus(findings), lookup, findings);
}
