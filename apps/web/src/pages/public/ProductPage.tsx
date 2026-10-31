import { useCallback } from 'react';
import { useParams } from 'react-router';
import { Eraser, Flag, ScanSearch } from 'lucide-react';
import { ButtonLink, Button } from '../../components/Button';
import { ErrorState } from '../../components/ErrorState';
import { PageHeading } from '../../components/PageHeading';
import { Skeleton } from '../../components/Skeleton';
import { StatusMessage } from '../../components/StatusMessage';
import { ProductIdentityCard } from '../../features/verify/ProductIdentityCard';
import { toRequestError } from '../../lib/errors';
import { PackNotFoundError, scanPack } from '../../lib/v2/client';
import { useResource } from '../../lib/v2/useResource';

export function ProductPage() {
  const identifier = useParams().identifier ?? '';
  const { data, error, loading, reload } = useResource(useCallback(() => scanPack(identifier), [identifier]));
  const blocked = data && (data.batch.status === 'BLOCKED' || data.batch.status === 'RECALLED' || data.pack.status === 'BLOCKED' || data.pack.status === 'REVOKED');
  const reportLink = `/report?pack=${encodeURIComponent(identifier)}`;

  return (
    <div className="mx-auto max-w-xl px-4 py-8 sm:px-6 sm:py-12">
      <PageHeading title="Product details" />

      {loading && (
        <div role="status" className="mt-6">
          <p className="text-sm text-muted">Finding this pack</p>
          <Skeleton className="mt-3 h-48 w-full" />
        </div>
      )}

      {error instanceof PackNotFoundError && (
        <div className="mt-6 space-y-4">
          <StatusMessage tone="warn" title="We could not find this pack" role="alert">
            Check the pack ID and try again. If the code was scanned correctly, this pack may not be enrolled. That does not prove it is fake.
          </StatusMessage>
          <div className="flex flex-col gap-3 sm:flex-row">
            <ButtonLink to="/scan">Scan again</ButtonLink>
            <ButtonLink to={reportLink} variant="secondary">Report this pack</ButtonLink>
          </div>
        </div>
      )}

      {error !== undefined && !(error instanceof PackNotFoundError) && (
        <div className="mt-6">
          <ErrorState error={toRequestError(error)}>
            <Button variant="secondary" onClick={reload}>Try again</Button>
          </ErrorState>
        </div>
      )}

      {data && (
        <div className="mt-6 space-y-5">
          {blocked && (
            <StatusMessage tone="risk" title="This pack or batch has been blocked" role="alert">
              Do not use this product until a pharmacist has checked it.
            </StatusMessage>
          )}

          <ProductIdentityCard summary={data} />

          <section aria-labelledby="next-step" className="rounded-lg border border-accent-line bg-accent-soft p-5">
            <Eraser aria-hidden="true" className="size-6 text-accent" />
            <h2 id="next-step" className="mt-2 text-lg font-semibold tracking-tight">Next, scratch the hidden panel</h2>
            <p className="mt-1 text-sm leading-relaxed">
              Scratch the panel on the pack to reveal a secret code, then enter it here. Scanning has not used up the code.
            </p>
            <ButtonLink to={`/authenticate?pack=${encodeURIComponent(identifier)}`} className="mt-4 w-full">Enter secret code</ButtonLink>
          </section>

          <div className="flex flex-col gap-3 sm:flex-row">
            <ButtonLink to="/inspect" variant="secondary" className="sm:flex-1">
              <ScanSearch aria-hidden="true" className="size-5" />
              Inspect packaging
            </ButtonLink>
            <ButtonLink to={reportLink} variant="secondary" className="sm:flex-1">
              <Flag aria-hidden="true" className="size-5" />
              Report a concern
            </ButtonLink>
          </div>
        </div>
      )}
    </div>
  );
}
