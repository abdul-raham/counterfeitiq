import { useCallback } from 'react';
import { useLocation, useParams } from 'react-router';
import { Flag, ScanBarcode, ScanSearch } from 'lucide-react';
import { Button, ButtonLink } from '../../components/Button';
import { ErrorState } from '../../components/ErrorState';
import { PageHeading } from '../../components/PageHeading';
import { ReportSection } from '../../components/ReportSection';
import { Skeleton } from '../../components/Skeleton';
import { StatusMessage, type Tone } from '../../components/StatusMessage';
import { SourceNotice } from '../../features/report/SourceNotice';
import { RecordDetails } from '../../features/report/RecordDetails';
import { formatDate, safeExternalUrl } from '../../lib/format';
import { toRequestError } from '../../lib/errors';
import { resolveOnce } from '../../lib/v3/client';
import type { ResolveResponse, ResultWarning, SourceInfo } from '@counterfeitiq/shared/v3';
import { useResource } from '../../lib/v3/useResource';

const SEVERITY_TONES: Record<ResultWarning['severity'], Tone> = { INFO: 'neutral', WARNING: 'warn', HIGH: 'risk' };

function formatDateTime(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' });
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 break-words font-medium">{value}</dd>
    </div>
  );
}

function DetailCard({ children }: { children: React.ReactNode }) {
  return <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border border-line bg-surface p-4 text-sm">{children}</dl>;
}

function SourceLine({ source }: { source: SourceInfo }) {
  if (source.type === 'DEMO_ERP') {
    return (
      <StatusMessage tone="warn" title="Demo record: fictional company and product">
        This comes from a simulated manufacturer system, built for demonstration. It is not real product data.
        <span className="mt-1 block text-muted">Retrieved {formatDateTime(source.retrievedAt)}.</span>
      </StatusMessage>
    );
  }
  const label = source.type === 'AUTHORIZED_ERP' ? 'manufacturer system' : 'regulatory reference';
  return <p className="text-sm text-muted">Source: {source.name} ({label}). Retrieved {formatDateTime(source.retrievedAt)}.</p>;
}

function LookupResult({ result }: { result: ResolveResponse }) {
  const { product, manufacturer, batch, pack, source, reference, scanSummary, warnings, limitations, identityLevel } = result;
  const website = safeExternalUrl(manufacturer?.website ?? undefined);

  if (source.status === 'UNAVAILABLE') {
    return (
      <div className="mt-6 space-y-4">
        <StatusMessage tone="neutral" title="We could not check this code" role="alert">
          {source.name} could not be reached. This says nothing about the product. Please try again shortly.
        </StatusMessage>
        <p className="break-all text-sm text-muted">Code: {result.identifier}</p>
      </div>
    );
  }

  if (source.status === 'NOT_FOUND' || !product || !manufacturer) {
    return (
      <div className="mt-6 space-y-4">
        <StatusMessage tone="warn" title="No record found" role="alert">
          {source.name} has no record of this code. This does not prove the product is fake, because not every manufacturer is connected.
        </StatusMessage>
        {warnings.map((warning) => <StatusMessage key={warning.code} tone={SEVERITY_TONES[warning.severity]} title={warning.message} />)}
        <p className="break-all text-sm text-muted">Code: {result.identifier}</p>
        <SourceLine source={source} />
      </div>
    );
  }

  // A repeat only means something for one serialized pack. Every pack of a product shares its barcode.
  const repeat = identityLevel === 'PACK' && scanSummary && scanSummary.previousScans > 0 ? scanSummary : null;

  return (
    <div className="mt-6">
      <div className="space-y-3">
        {warnings.map((warning) => (
          <StatusMessage key={warning.code} tone={SEVERITY_TONES[warning.severity]} title={warning.message} role={warning.severity === 'HIGH' ? 'alert' : undefined} />
        ))}
      </div>

      <section aria-label="Product" className={`rounded-lg border border-line bg-surface p-5 ${warnings.length ? 'mt-3' : ''}`}>
        <p className="text-sm text-muted">{manufacturer.name}</p>
        <p className="mt-1 text-2xl font-semibold leading-tight tracking-tight">{product.name}</p>
        {product.description && <p className="mt-2 text-sm leading-relaxed text-muted">{product.description}</p>}
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-4 text-sm">
          <Detail label="Brand" value={product.brand} />
          <Detail label="Strength" value={product.strength} />
          <Detail label="Form" value={product.dosageForm} />
          <Detail label="Pack size" value={product.packSize} />
          <Detail label="Active ingredients" value={product.activeIngredients.join(', ') || null} />
          <Detail label="NAFDAC number" value={product.nafdacNumber} />
        </dl>
      </section>

      <div className="mt-3"><SourceLine source={source} /></div>

      {repeat && (
        <div className="mt-3">
          <StatusMessage tone="neutral" title={`This pack code has been scanned ${repeat.previousScans === 1 ? 'once' : `${repeat.previousScans} times`} before`}>
            {repeat.firstScannedAt && <>First scanned {formatDateTime(repeat.firstScannedAt)}. </>}
            This could be you, a pharmacist or another shopper, so it does not mean the product is fake.
            <span className="mt-1 block text-muted">{repeat.persistenceNote}</span>
          </StatusMessage>
        </div>
      )}

      <ReportSection title="Manufacturer">
        <DetailCard>
          <Detail label="Name" value={manufacturer.name} />
          <Detail label="Country" value={manufacturer.country} />
          {website && (
            <div>
              <dt className="text-xs text-muted">Website</dt>
              <dd className="mt-0.5 break-words font-medium"><a href={website} target="_blank" rel="noreferrer" className="rounded-sm underline underline-offset-4">{website}</a></dd>
            </div>
          )}
        </DetailCard>
      </ReportSection>

      {batch && (
        <ReportSection title="Batch">
          <DetailCard>
            <Detail label="Batch number" value={batch.batchNumber} />
            <Detail label="Status" value={batch.status} />
            <Detail label="Manufactured" value={formatDate(batch.manufacturingDate)} />
            <Detail label="Expires" value={formatDate(batch.expiryDate)} />
          </DetailCard>
        </ReportSection>
      )}

      {pack && (
        <ReportSection title="This pack">
          <DetailCard>
            <Detail label="Serial number" value={pack.serialNumber} />
            <Detail label="Status" value={pack.status} />
          </DetailCard>
        </ReportSection>
      )}

      {reference?.status === 'FOUND' && (
        <ReportSection title="Registration record">
          <RecordDetails record={reference.record} />
          <div className="mt-3"><SourceNotice reference={reference} /></div>
        </ReportSection>
      )}

      {limitations.length > 0 && (
        <ReportSection title="What this cannot tell you">
          <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
            {limitations.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </ReportSection>
      )}
    </div>
  );
}

export function ProductPage() {
  const identifier = useParams().identifier ?? '';
  const location = useLocation();
  // Only a fresh scan counts. Refreshing or coming back to this page must not look like a repeat.
  const fromScan = Boolean((location.state as { fromScan?: boolean } | null)?.fromScan);
  const { data, error, loading, reload } = useResource(useCallback(
    () => resolveOnce(location.key, identifier, fromScan),
    [location.key, identifier, fromScan],
  ));
  const reportLink = `/report?code=${encodeURIComponent(identifier)}`;

  return (
    <div className="mx-auto max-w-xl px-4 py-8 sm:px-6 sm:py-12">
      <PageHeading title="Product details" />

      {loading && (
        <div role="status" className="mt-6">
          <p className="text-sm text-muted">Checking the manufacturer's records</p>
          <Skeleton className="mt-3 h-48 w-full" />
        </div>
      )}

      {error !== undefined && (
        <div className="mt-6">
          <ErrorState error={toRequestError(error)}>
            <Button variant="secondary" onClick={reload}>Try again</Button>
          </ErrorState>
        </div>
      )}

      {data && <LookupResult result={data} />}

      {!loading && (
        <div className="mt-8 flex flex-col gap-3 border-t border-line pt-6">
          <ButtonLink to="/scan">
            <ScanBarcode aria-hidden="true" className="size-5" />
            Scan another product
          </ButtonLink>
          <ButtonLink to="/inspect" variant="secondary">
            <ScanSearch aria-hidden="true" className="size-5" />
            Inspect the packaging
          </ButtonLink>
          <ButtonLink to={reportLink} variant="quiet">
            <Flag aria-hidden="true" className="size-4" />
            Report a concern
          </ButtonLink>
        </div>
      )}
    </div>
  );
}
