import type { AnalysisResponse, ExtractedProduct, FieldMatch, LookupMode, MedicineReference, ReferenceLookupResult } from '@counterfeitiq/shared';
import type { Tone } from '../../components/StatusMessage';

export interface Outcome {
  tone: Tone;
  title: string;
  caveat: string;
  suggestRetake: boolean;
}

// Only a live lookup actually tried the official source, so only it may say the source failed.
export const unavailableReason: Record<LookupMode, string> = {
  LIVE_OFFICIAL: 'the official NAFDAC source could not be reached',
  DEMO_FIXTURE: 'no matching demonstration record is available and no live lookup was performed',
  NOT_EXECUTED: 'no registration source was checked',
};

// The contract has no registration status, so the live adapter reports an inactive
// registration as a note on an otherwise found record.
export function registrationWarning(reference: ReferenceLookupResult | null): string | null {
  return reference?.status === 'FOUND' && reference.provenance.mode === 'LIVE_OFFICIAL'
    ? reference.provenance.note ?? null
    : null;
}

export function nothingWasRead(extracted: ExtractedProduct): boolean {
  return !extracted.productName && !extracted.brand && !extracted.nafdacNumber
    && !extracted.manufacturer && !extracted.strength && extracted.ingredients.length === 0
    && !extracted.expiryDate;
}

export function describeOutcome({ extracted, reference, verification }: AnalysisResponse): Outcome {
  const demo = reference?.provenance.mode === 'DEMO_FIXTURE';
  const outcome = (tone: Tone, title: string, caveat: string, suggestRetake = false): Outcome =>
    ({ tone, title, caveat, suggestRetake });

  switch (verification.status) {
    case 'REGISTRATION_DETAILS_MATCH':
      // Never green over an expired date: the match is not the news the reader needs.
      return outcome(
        verification.packageExpiryStatus === 'EXPIRED' || verification.registrationExpiryStatus === 'EXPIRED' || registrationWarning(reference) ? 'warn' : 'ok',
        demo ? 'Details match a demonstration record' : 'Registration details match',
        'This does not prove this pack is genuine.',
      );
    case 'DETAILS_MISMATCH':
      return outcome(
        'risk',
        demo ? 'Some details differ from a demonstration record' : 'Some details differ from the registration record',
        'This does not prove the product is fake. Have it checked before using it.',
      );
    case 'RECORD_NOT_FOUND':
      return outcome(
        'warn',
        'No registration record found',
        'This does not prove the product is fake. Check the number against the pack.',
      );
    case 'REFERENCE_UNAVAILABLE':
      return outcome(
        'warn',
        'Registration records could not be checked',
        '',
      );
    case 'INSUFFICIENT_EVIDENCE': {
      const caveat = '';
      if (nothingWasRead(extracted)) return outcome('neutral', 'We could not read enough from this photo', caveat, true);
      // The backend also marks an unread category as unsupported, so this must come first.
      if (!extracted.category?.trim()) return outcome('neutral', 'We could not tell what type of product this is', caveat, true);
      if (!verification.categoryVerificationSupported) {
        return outcome('neutral', 'Registration check is not available for this product type', caveat);
      }
      if (!extracted.nafdacNumber) return outcome('neutral', 'No NAFDAC number could be read', caveat, true);
      return outcome('neutral', 'Not enough information to compare', caveat);
    }
  }
}

export interface ComparisonRow {
  key: string;
  label: string;
  packValue: string | null;
  recordValue: string | null;
  status: FieldMatch | null;
}

function joined(values: string[]): string | null {
  return values.length > 0 ? values.join(', ') : null;
}

const COMPARED_FIELDS: {
  field: string;
  label: string;
  pack: (product: ExtractedProduct) => string | null;
  record: (record: MedicineReference) => string | null;
}[] = [
  { field: 'productName', label: 'Product name', pack: (p) => p.productName, record: (r) => r.productName },
  { field: 'nafdacNumber', label: 'NAFDAC number', pack: (p) => p.nafdacNumber, record: (r) => r.nafdacNumber },
  { field: 'manufacturer', label: 'Manufacturer', pack: (p) => p.manufacturer, record: (r) => r.manufacturer },
  { field: 'strength', label: 'Strength', pack: (p) => p.strength, record: (r) => r.strength },
  { field: 'ingredients', label: 'Ingredients', pack: (p) => joined(p.ingredients), record: (r) => joined(r.ingredients) },
];

function humanize(field: string): string {
  const spaced = field.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

// Match status always comes from the backend's findings. The UI never decides
// for itself that two values agree, so a field with no finding has no status.
export function buildComparisonRows({ extracted, reference, verification }: AnalysisResponse): ComparisonRow[] {
  const record = reference?.status === 'FOUND' ? reference.record : null;
  const known = new Set(COMPARED_FIELDS.map(({ field }) => field));

  const compared: ComparisonRow[] = COMPARED_FIELDS.map(({ field, label, pack, record: fromRecord }) => ({
    key: field,
    label,
    packValue: pack(extracted),
    recordValue: record ? fromRecord(record) : null,
    status: verification.findings.find((finding) => finding.field === field)?.status ?? null,
  }));

  const others = verification.findings
    .filter((finding) => !known.has(finding.field))
    .map((finding) => ({
      key: finding.code,
      label: humanize(finding.field),
      packValue: finding.packagingValue,
      recordValue: finding.referenceValue,
      status: finding.status,
    }));

  // A row with nothing to compare only adds noise. What the pack says is shown elsewhere.
  const rows = compared.filter((row) => (record ? row.recordValue : row.packValue));
  return [...rows, ...others];
}

export function unreadFields(extracted: ExtractedProduct): string[] {
  const fields: [string, boolean][] = [
    ['product name', !extracted.productName],
    ['NAFDAC number', !extracted.nafdacNumber],
    ['printed expiry date', !extracted.expiryDate],
  ];
  return fields.filter(([, missing]) => missing).map(([label]) => label);
}
