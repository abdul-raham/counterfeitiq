import { Navigate } from 'react-router';
import { Flag, QrCode, RefreshCw, ScanSearch } from 'lucide-react';
import { ButtonLink } from '../../components/Button';
import { PageHeading } from '../../components/PageHeading';
import { ReportSection } from '../../components/ReportSection';
import { StatusMessage, toneStyles } from '../../components/StatusMessage';
import { OUTCOMES } from '../../features/verify/outcome';
import { ProductIdentityCard } from '../../features/verify/ProductIdentityCard';
import { useVerify } from '../../features/verify/VerifyContext';

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' });
}

export function VerificationResultPage() {
  const { result } = useVerify();
  if (!result) return <Navigate to="/scan" replace />;

  const { response, publicIdentifier, afterFailedAttempt } = result;
  const copy = OUTCOMES[response.outcome];
  const tone = toneStyles[copy.tone];
  const pack = encodeURIComponent(publicIdentifier);
  const repeat = response.outcome === 'PREVIOUSLY_VERIFIED';

  return (
    <div className="mx-auto max-w-xl px-4 py-8 sm:px-6 sm:py-12">
      <PageHeading title="Verification result" />

      <section aria-label="Result" className={`mt-5 rounded-lg border p-5 sm:p-6 ${tone.box}`}>
        <tone.icon aria-hidden="true" className={`size-6 ${tone.text}`} />
        <p className={`mt-3 text-2xl font-semibold leading-tight tracking-tight ${tone.text}`}>{copy.title}</p>
        <p className="mt-2 leading-relaxed">{copy.body}</p>
        {repeat && response.firstVerifiedAt && (
          <p className="mt-3 border-t border-ink/10 pt-3 text-sm">First checked: <span className="font-medium">{formatDateTime(response.firstVerifiedAt)}</span></p>
        )}
      </section>

      {repeat && afterFailedAttempt && (
        <div className="mt-3">
          <StatusMessage tone="neutral" title="This may be your earlier attempt">
            Your last attempt failed on the way back, so it may have been recorded as the first check.
          </StatusMessage>
        </div>
      )}

      {response.product && (
        <ReportSection title="What this code is linked to">
          <ProductIdentityCard summary={response.product} />
        </ReportSection>
      )}

      <ReportSection title="What to do next">
        <ol className="list-decimal space-y-1.5 pl-5 leading-relaxed">
          {copy.nextSteps.map((step) => <li key={step}>{step}</li>)}
        </ol>
      </ReportSection>

      <div className="mt-8 flex flex-col gap-3 border-t border-line pt-6">
        {copy.canRetry && (
          <ButtonLink to={`/authenticate?pack=${pack}`}>
            <RefreshCw aria-hidden="true" className="size-4" />
            Try again
          </ButtonLink>
        )}
        <ButtonLink to={`/report?pack=${pack}&outcome=${response.outcome}`} variant={copy.canRetry || copy.tone === 'accent' ? 'secondary' : 'primary'}>
          <Flag aria-hidden="true" className="size-4" />
          Report a concern
        </ButtonLink>
        <ButtonLink to="/inspect" variant="secondary">
          <ScanSearch aria-hidden="true" className="size-4" />
          Inspect the packaging
        </ButtonLink>
        <ButtonLink to="/scan" variant="quiet">
          <QrCode aria-hidden="true" className="size-4" />
          Scan another product
        </ButtonLink>
      </div>
    </div>
  );
}
