import { Camera, Hash } from 'lucide-react';
import { ButtonLink } from '../components/Button';
import { useDocumentTitle } from '../lib/useDocumentTitle';

const steps = [
  { title: 'Photograph the pack', body: 'Or type in the NAFDAC number if you already have it.' },
  { title: 'We read the details', body: "An open-weight AI model reads what is printed. For medicines, we look up the number in NAFDAC's public Greenbook." },
  { title: 'See what lines up', body: 'You get a plain report of what matches, what differs and what is still unknown.' },
];

const reportContents = [
  { title: 'Pack compared with the record', body: 'Product name, NAFDAC number, strength and ingredients, side by side.' },
  { title: 'Two separate expiry dates', body: 'The date printed on the pack, and the date on the registration record.' },
  { title: 'Where the result came from', body: 'The source used and when it was checked, or why it could not be checked.' },
  { title: 'What to do next', body: 'Plain next steps, including what is still unknown.' },
];

function ReportContents() {
  return (
    <section aria-labelledby="report-contents" className="overflow-hidden rounded-lg border border-line bg-surface shadow-[0_24px_60px_-32px_rgb(23_42_64/28%)]">
      <h2 id="report-contents" className="border-b border-line px-4 py-3 text-lg font-semibold tracking-tight">What your report shows</h2>
      <ul className="divide-y divide-line">
        {reportContents.map((item) => (
          <li key={item.title} className="px-4 py-3.5">
            <p className="font-medium">{item.title}</p>
            <p className="mt-0.5 text-sm leading-relaxed text-muted">{item.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function HomePage() {
  useDocumentTitle('Know what you’re buying');

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6">
      <div className="grid items-center gap-10 py-12 sm:py-20 lg:grid-cols-[1.15fr_1fr] lg:gap-16">
        <div>
          <h1 tabIndex={-1} className="text-[clamp(2.75rem,8vw,4.5rem)] font-semibold leading-[1.02] tracking-[-0.04em]">
            Know what you're buying.
          </h1>
          <p className="mt-5 max-w-lg text-lg leading-relaxed text-muted sm:text-xl">
            Scan a product to examine its details and check available registration records.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <ButtonLink to="/scan">
              <Camera aria-hidden="true" className="size-5" />
              Scan a product
            </ButtonLink>
            <ButtonLink to="/lookup" variant="secondary">
              <Hash aria-hidden="true" className="size-5" />
              Enter NAFDAC number
            </ButtonLink>
          </div>
        </div>
        <ReportContents />
      </div>

      <section aria-labelledby="how-it-works" className="border-t border-line py-12">
        <h2 id="how-it-works" className="text-xl font-semibold tracking-tight">How it works</h2>
        <ol className="mt-6 grid gap-6 sm:grid-cols-3 sm:gap-8">
          {steps.map((step, index) => (
            <li key={step.title} className="flex gap-4 sm:block">
              <span aria-hidden="true" className="text-sm font-medium tabular-nums text-muted">{index + 1}</span>
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
          A registration match does not prove a physical pack is genuine, because counterfeit packaging can copy real
          details. A missing record does not prove a product is fake. CounterfeitIQ shows you the evidence so you can
          decide what to check next. Greenbook lookups are experimental and not endorsed by NAFDAC.
        </p>
      </section>
    </div>
  );
}
