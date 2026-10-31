import { Link } from 'react-router';

// Fictional codes seeded in apps/demo-erp. See docs/demo.md for printable versions.
const DEMO_CODES = [
  { label: 'Product code', identifier: '2000000001012' },
  { label: 'Product with no batch data', identifier: '2000000001029' },
  { label: 'Batch code', identifier: '(01)02000000001012(10)DX2041' },
  { label: 'Serialized pack, try it twice', identifier: '(01)02000000001012(21)DEMOSN0001' },
  { label: 'Recalled batch', identifier: '(01)02000000001012(10)DX2042' },
  { label: 'Expired batch', identifier: '(01)02000000001012(10)DX1999' },
  { label: 'Blocked pack', identifier: '(01)02000000001012(21)DEMOSN0003' },
  { label: 'Incomplete record', identifier: '2000000002026' },
  { label: 'Code with no record', identifier: '2000000009995' },
];

export function DemoCodes() {
  return (
    <section aria-labelledby="demo-codes" className="mt-8 rounded-lg border border-line bg-surface p-4 text-sm">
      <h2 id="demo-codes" className="font-medium">Try a demo code</h2>
      <p className="mt-1 text-muted">These use fictional companies and products.</p>
      <ul className="mt-3 space-y-2">
        {DEMO_CODES.map(({ label, identifier }) => (
          <li key={identifier}>
            <Link to={`/product/${encodeURIComponent(identifier)}`} className="rounded-sm font-medium underline underline-offset-4">{label}</Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
