import type { MedicineReference } from '@counterfeitiq/shared';
import { formatDate } from '../../lib/format';

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 px-4 py-3">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="break-words font-medium">{value}</dd>
    </div>
  );
}

export function RecordDetails({ record }: { record: MedicineReference }) {
  return (
    <dl className="divide-y divide-line rounded-lg border border-line bg-surface">
      <Row label="Product" value={record.productName} />
      <Row label="NAFDAC number" value={record.nafdacNumber} />
      <Row label="Applicant" value={record.applicant} />
      <Row label="Status" value={record.registrationStatus} />
      <Row label="Manufacturer" value={record.manufacturer} />
      <Row label="Category" value={record.productCategory} />
      <Row label="Form" value={record.dosageForm} />
      <Row label="Route" value={record.route} />
      <Row label="Pack size" value={record.packSize} />
      <Row label="Strength" value={record.strength} />
      <Row label="Ingredients" value={record.ingredients.length > 0 ? record.ingredients.join(', ') : null} />
      <Row label="Approved" value={formatDate(record.approvalDate ?? null)} />
      <Row label="Registration expiry" value={formatDate(record.registrationExpiry)} />
    </dl>
  );
}
