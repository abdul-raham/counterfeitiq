import { Link } from 'react-router';
import { PageHeading } from '../../components/PageHeading';

// Fictional codes seeded in apps/demo-erp, except the fake ones, which it has never issued.
const DEMO_CODES = [
  { label: 'Product code', shows: 'The product and manufacturer.', identifier: '2000000001012', image: '1-product.png' },
  { label: 'Product with no batch data', shows: 'A product with nothing else indexed.', identifier: '2000000001029', image: '2-product-no-batch-data.png' },
  { label: 'Batch code', shows: 'Adds batch details.', identifier: '(01)02000000001012(10)DX2041', image: '3-batch-code.png' },
  { label: 'Serialized pack, try it twice', shows: 'Adds pack details. A scan from a second device asks whether you scratched the panel earlier.', identifier: '(01)02000000001012(10)DX2041(17)280131(21)DEMOSN0001', image: '4-serialized-pack.png' },
  { label: 'Recalled batch', shows: 'A recall warning.', identifier: '(01)02000000001012(10)DX2042', image: '5-recalled-batch.png' },
  { label: 'Expired batch', shows: 'An expiry warning.', identifier: '(01)02000000001012(10)DX1999', image: '6-expired-batch.png' },
  { label: 'Blocked pack', shows: 'A blocked pack warning.', identifier: '(01)02000000001012(21)DEMOSN0003', image: '7-blocked-pack.png' },
  { label: 'Incomplete record', shows: 'A record with missing details.', identifier: '2000000002026', image: '8-incomplete-record.png' },
  { label: 'Bottled water', shows: 'Not only medicine: a pack of water, with its batch and pack details.', identifier: '(01)02000000004013(10)WT3001(17)270930(21)DEMOWT0001', image: '12-bottled-water.png' },
  { label: 'Fake code', shows: 'A product the manufacturer has no record of.', identifier: '2000000009995', image: '9-fake-code.png' },
  { label: 'Fake pack', shows: 'A real product with a serial number that was never issued.', identifier: '(01)02000000001012(21)FAKESN0001', image: '10-fake-pack.png' },
  { label: 'Fake batch', shows: 'A real product with a batch that was never issued.', identifier: '(01)02000000001012(10)FAKEBATCH', image: '11-fake-batch.png' },
];

export function DemoPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <PageHeading title="Demo QR codes">
        Show this page on one screen, and scan a code with a phone's camera. Every company and product here is fictional. Only codes with a serial number show a repeat scan notice, because every pack of a product shares the other codes.
      </PageHeading>
      <ul className="mt-6 grid gap-4 sm:grid-cols-2">
        {DEMO_CODES.map(({ label, shows, identifier, image }) => (
          <li key={identifier} className="rounded-lg border border-line bg-surface p-4">
            <img src={`/qr/${image}`} alt={`QR code for ${label}`} className="mx-auto size-48 rounded-sm bg-white" />
            <h2 className="mt-3 font-medium">{label}</h2>
            <p className="mt-1 text-sm text-muted">{shows}</p>
            <Link to={`/product/${encodeURIComponent(identifier)}?qr=1`} className="mt-2 inline-block rounded-sm text-sm font-medium underline underline-offset-4">
              Open result<span className="sr-only">: {label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
