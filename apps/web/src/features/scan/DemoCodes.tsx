import { Link } from 'react-router';

// Fictional codes seeded in the simulated manufacturer ERP. See docs/demo.md for printable versions.
const DEMO_CODES = [
  { label: 'Product barcode', identifier: '2000000000015' },
  { label: 'Batch code', identifier: '(01)02000000000015(10)ZEN2401(17)280630' },
  { label: 'Serialized pack, try it twice', identifier: '(01)02000000000015(10)ZEN2401(17)280630(21)SN0001' },
  { label: 'Recalled batch', identifier: '(01)02000000000015(21)SN0003' },
  { label: 'Expired batch', identifier: '(01)02000000000015(21)SN0002' },
  { label: 'Code with no record', identifier: '2000000000046' },
  { label: 'Manufacturer system offline', identifier: '2000000000039' },
];

export function DemoCodes() {
  return (
    <section aria-labelledby="demo-codes" className="mt-8 rounded-lg border border-line bg-surface p-4 text-sm">
      <h2 id="demo-codes" className="font-medium">Try a demo code</h2>
      <p className="mt-1 text-muted">These use fictional companies and products.</p>
      <ul className="mt-3 space-y-2">
        {DEMO_CODES.map(({ label, identifier }) => (
          <li key={identifier}>
            <Link to={`/product/${encodeURIComponent(identifier)}`} state={{ fromScan: true }} className="rounded-sm font-medium underline underline-offset-4">{label}</Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
