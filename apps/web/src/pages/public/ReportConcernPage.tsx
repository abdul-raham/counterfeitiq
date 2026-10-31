import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { Check, Copy, ExternalLink } from 'lucide-react';
import { Button } from '../../components/Button';
import { PageHeading } from '../../components/PageHeading';

const NAFDAC_SITE = 'https://nafdac.gov.ng/';

// Nothing is sent or stored here. CounterfeitIQ has no team or database to receive reports,
// so this points people to those who can act, instead of a form that goes nowhere.
export function ReportConcernPage() {
  const code = useSearchParams()[0].get('code');
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-8 sm:px-6 sm:py-12">
      <PageHeading title="Report a concern">
        If a pack worries you, these are the people who can act on it.
      </PageHeading>

      <ol className="mt-6 list-decimal space-y-3 pl-5 leading-relaxed">
        <li><span className="font-medium">Do not use the product yet.</span> Keep the pack and your receipt if you have them.</li>
        <li><span className="font-medium">Show it to a pharmacist.</span> If you have already taken it and feel unwell, speak to a pharmacist or doctor now.</li>
        <li><span className="font-medium">Report it to NAFDAC.</span> Use the contact details on NAFDAC's official website.</li>
      </ol>

      {code && (
        <section aria-label="Scanned code" className="mt-6 rounded-lg border border-line bg-surface p-4">
          <p className="text-xs text-muted">The code you scanned</p>
          <p className="mt-0.5 break-all font-medium">{code}</p>
          <Button variant="secondary" className="mt-3" onClick={() => void copyCode()}>
            {copied ? <Check aria-hidden="true" className="size-4" /> : <Copy aria-hidden="true" className="size-4" />}
            {copied ? 'Copied' : 'Copy code'}
          </Button>
        </section>
      )}

      <a href={NAFDAC_SITE} target="_blank" rel="noreferrer" className="mt-6 inline-flex items-center gap-1.5 rounded-sm font-medium underline underline-offset-4">
        Go to NAFDAC's website
        <ExternalLink aria-hidden="true" className="size-4" />
      </a>
      <p className="mt-4 text-sm text-muted">CounterfeitIQ is independent, is not part of NAFDAC, and does not receive reports.</p>
    </div>
  );
}
