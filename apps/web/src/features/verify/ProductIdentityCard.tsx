import { formatDate } from '../../lib/format';
import type { PublicProductSummary } from '../../lib/v2/contract';

function Item({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 break-words font-medium">{value}</dd>
    </div>
  );
}

export function ProductIdentityCard({ summary }: { summary: PublicProductSummary }) {
  const { product, manufacturer, batch, pack } = summary;
  return (
    <section aria-label="Product details" className="rounded-lg border border-line bg-surface p-5">
      <p className="text-sm text-muted">{manufacturer.displayName}</p>
      <p className="mt-1 text-2xl font-semibold leading-tight tracking-tight">{product.name}</p>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-4 text-sm">
        <Item label="Brand" value={product.brand} />
        <Item label="Strength" value={product.strength} />
        <Item label="Form" value={product.dosageForm} />
        <Item label="Batch" value={batch.batchNumber} />
        <Item label="Manufactured" value={formatDate(batch.manufacturingDate)} />
        <Item label="Expires" value={formatDate(batch.expiryDate)} />
        <Item label="Active ingredients" value={product.activeIngredients.join(', ') || null} />
        <Item label="Pack ID" value={pack.publicIdentifier} />
      </dl>
    </section>
  );
}
