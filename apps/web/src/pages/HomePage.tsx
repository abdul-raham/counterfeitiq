import { QrCode, ScanSearch } from 'lucide-react';
import { ButtonLink } from '../components/Button';
import { useDocumentTitle } from '../lib/useDocumentTitle';

const steps = [
  { title: 'Scan the QR code', body: 'Use your camera, a photo, or type the code. No account needed.' },
  { title: 'See the record', body: "We ask the manufacturer's system what it holds for that code." },
  { title: 'Read the details', body: 'See the product, batch and pack details where available, and where they came from.' },
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
          Scan a medicine's QR code to see what its manufacturer has on record.
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

      <section aria-labelledby="limits" className="border-t border-line py-12">
        <h2 id="limits" className="text-xl font-semibold tracking-tight">What this can and cannot tell you</h2>
        <p className="mt-3 max-w-2xl leading-relaxed text-muted">
          A record shows what a manufacturer holds for a code. It does not prove a pack is genuine, because a code can be copied. A CounterfeitIQ QR code missing from the manufacturer's records is fake. This demonstration uses fictional companies and products.
        </p>
      </section>
    </div>
  );
}
