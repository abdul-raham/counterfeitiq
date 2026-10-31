import { Link } from 'react-router';
import { SAMPLE_PACKS } from './v2Sample';

export default function SamplePacks() {
  return (
    <section aria-label="Sample packs" className="mt-8 rounded-lg border border-warn-line bg-warn-soft p-4 text-sm">
      <h2 className="font-medium text-warn">Sample packs (fictional)</h2>
      <ul className="mt-2 space-y-1.5">
        {SAMPLE_PACKS.map((pack) => (
          <li key={pack.id}>
            <Link to={`/product/${pack.id}`} className="underline underline-offset-4">{pack.id}</Link>
            {' '}<span className="text-muted">{pack.note}. Code {pack.code}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
