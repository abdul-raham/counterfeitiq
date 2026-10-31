import { QrCode, ScanSearch } from 'lucide-react';
import { ButtonLink } from '../components/Button';
import { useDocumentTitle } from '../lib/useDocumentTitle';

const steps = [
  { title: 'Scan the pack', body: 'Scan the QR code, or type the pack ID, to see the product details.' },
  { title: 'Scratch the panel', body: 'Reveal the hidden code only after you have looked at the details.' },
  { title: 'Enter the code', body: "See whether the code is in the manufacturer's records, and whether it has been checked before." },
];

const checks = [
  { title: 'Code check', body: "Compares the scratch code with the manufacturer's records." },
  { title: 'Registration lookup', body: "Looks up a NAFDAC number in NAFDAC's public Greenbook. Experimental, and not endorsed by NAFDAC." },
  { title: 'Packaging inspection', body: 'An AI reads the pack, and we show what it found and what differs.' },
];

export function HomePage() {
  useDocumentTitle('Know what you’re buying');

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6">
      <div className="py-12 sm:py-20">
        <h1 tabIndex={-1} className="max-w-3xl text-[clamp(2.75rem,8vw,4.5rem)] font-semibold leading-[1.02] tracking-[-0.04em]">
          Know what you're buying.
        </h1>
        <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted sm:text-xl">
          Scan the code on a pack to see its product details, then check its hidden code against the manufacturer's records.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <ButtonLink to="/scan">
            <QrCode aria-hidden="true" className="size-5" />
            Scan a product
          </ButtonLink>
          <ButtonLink to="/inspect" variant="secondary">
            <ScanSearch aria-hidden="true" className="size-5" />
            Inspect packaging
          </ButtonLink>
        </div>
      </div>

      <section aria-labelledby="how-it-works" className="border-t border-line py-12">
        <h2 id="how-it-works" className="text-xl font-semibold tracking-tight">How it works</h2>
        <ol className="mt-6 grid gap-6 sm:grid-cols-3 sm:gap-8">
          {steps.map((step, index) => (
            <li key={step.title} className="flex gap-4 sm:block">
              <span aria-hidden="true" className="text-sm font-medium tabular-nums text-accent">{index + 1}</span>
              <div className="sm:mt-2">
                <h3 className="font-medium">{step.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="three-checks" className="border-t border-line py-12">
        <h2 id="three-checks" className="text-xl font-semibold tracking-tight">Three separate checks</h2>
        <dl className="mt-6 grid gap-6 sm:grid-cols-3 sm:gap-8">
          {checks.map((check) => (
            <div key={check.title}>
              <dt className="font-medium">{check.title}</dt>
              <dd className="mt-1 text-sm leading-relaxed text-muted">{check.body}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-8 max-w-2xl leading-relaxed text-muted">
          No check here proves a pack is genuine, because a code or label can be copied. And a missing record does not prove a product is fake.
        </p>
      </section>
    </div>
  );
}
