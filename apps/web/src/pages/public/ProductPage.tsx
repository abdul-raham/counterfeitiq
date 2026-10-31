import { useCallback, type ReactNode } from 'react';
import { useLocation, useParams, useSearchParams } from 'react-router';
import { Flag, QrCode, ScanSearch } from 'lucide-react';
import { Button, ButtonLink } from '../../components/Button';
import { ErrorState } from '../../components/ErrorState';
import { PageHeading } from '../../components/PageHeading';
import { ReportSection } from '../../components/ReportSection';
import { Skeleton } from '../../components/Skeleton';
import { StatusMessage, type Tone } from '../../components/StatusMessage';
import { RecordDetails } from '../../features/report/RecordDetails';
import { PackCheck } from '../../features/scan/PackCheck';
import { toRequestError } from '../../lib/errors';
import { formatDate } from '../../lib/format';
import { scanOnce } from '../../lib/v3/client';
import type { ProductReport, Provenance } from '../../lib/v3/contract';
import { useResource } from '../../lib/v3/useResource';

const SERIOUS_WARNINGS = new Set(['BATCH_RECALLED', 'BATCH_BLOCKED', 'PACK_BLOCKED', 'BATCH_EXPIRED', 'BATCH_DIFFERS_FROM_PACK_RECORD']);
const QUIET_WARNINGS = new Set(['SCAN_HISTORY_UNAVAILABLE', 'PACK_DATA_UNAVAILABLE', 'BATCH_DATA_UNAVAILABLE']);

function warningTone(code: string): Tone {
  if (SERIOUS_WARNINGS.has(code)) return 'risk';
  return QUIET_WARNINGS.has(code) ? 'neutral' : 'warn';
}

const MANUFACTURER_SOURCES = new Set<Provenance['sourceType']>(['SIMULATED_ERP', 'MANUFACTURER_API']);

/**
 * Only a connected manufacturer's codes go into a CounterfeitIQ QR code, so one its records don't
 * hold was not issued by it. A source that could not answer is never enough to say this.
 */
function isFakeQrCode({ outcome, warnings, identifier, batch, sources }: ProductReport): boolean {
  if (outcome === 'NOT_FOUND' || outcome === 'INVALID_IDENTIFIER') return true;
  if (outcome !== 'RESOLVED') return false;
  if (warnings.some((warning) => warning.code === 'SERIAL_NOT_FOUND')) return true;
  return Boolean(identifier.batchNumber) && !batch
    && sources.some((source) => MANUFACTURER_SOURCES.has(source.sourceType) && source.retrievalStatus === 'NOT_FOUND');
}

function title(value: string | null): string | null {
  return value ? value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, ' ') : null;
}

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

function DetailCard({ children }: { children: ReactNode }) {
  return <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border border-line bg-surface p-4 text-sm">{children}</dl>;
}

function Sources({ sources }: { sources: Provenance[] }) {
  if (sources.some((source) => source.isDemo)) return null;
  const used = sources.filter((source) => source.retrievalStatus !== 'NOT_ATTEMPTED');
  const names = [...new Set(used.map((source) => source.sourceName))];
  const retrievedAt = formatDateTime(used.find((source) => source.retrievedAt)?.retrievedAt ?? null);
  if (names.length === 0) return null;
  return <p className="text-sm text-muted">Source: {names.join(', ')}.{retrievedAt && ` Retrieved ${retrievedAt}.`}</p>;
}

function LookupResult({ report, reportLink, code, fromQr }: { report: ProductReport; reportLink: string; code: string; fromQr: boolean }) {
  const { outcome, product, batch, pack, sources, warnings, explanation, notice, identityLevel, registrationReference } = report;

  if (fromQr && isFakeQrCode(report)) {
    return (
      <div className="mt-6 space-y-4">
        <StatusMessage tone="risk" title="This QR code is fake" role="alert">
          This code is not in the manufacturer's records, so it did not come from them. Do not use this medicine. Show it to a pharmacist, and report it.
          {product && <span className="mt-1 block">The code claims to be {product.productName}{product.manufacturer && ` from ${product.manufacturer}`}.</span>}
        </StatusMessage>
        <p className="break-all text-sm text-muted">Code: {code}</p>
        <Sources sources={sources} />
      </div>
    );
  }

  if (outcome === 'INVALID_IDENTIFIER') {
    return (
      <div className="mt-6 space-y-4">
        <StatusMessage tone="warn" title="That is not a readable product code" role="alert">
          Try scanning again, or type the code printed next to it. It may have been misread.
        </StatusMessage>
        <p className="break-all text-sm text-muted">Code: {code}</p>
      </div>
    );
  }

  if (outcome === 'SOURCE_UNAVAILABLE') {
    return (
      <div className="mt-6 space-y-4">
        <StatusMessage tone="neutral" title="We could not check this code" role="alert">{explanation}</StatusMessage>
        <p className="break-all text-sm text-muted">Code: {code}</p>
      </div>
    );
  }

  if (outcome === 'NOT_FOUND' || !product) {
    return (
      <div className="mt-6 space-y-4">
        <StatusMessage tone="warn" title="No record found" role="alert">
          The connected source has no product with this code. This does not prove the product is fake, because not every manufacturer is connected.
        </StatusMessage>
        <p className="break-all text-sm text-muted">Code: {code}</p>
        <Sources sources={sources} />
      </div>
    );
  }

  const noteworthy = warnings.filter((warning) => warning.code !== 'SCAN_HISTORY_UNAVAILABLE');

  return (
    <div className="mt-6">
      {noteworthy.length > 0 && (
        <div className="mb-3 space-y-3">
          {noteworthy.map((warning) => (
            <StatusMessage key={warning.code} tone={warningTone(warning.code)} title={warning.explanation} role={SERIOUS_WARNINGS.has(warning.code) ? 'alert' : undefined} />
          ))}
        </div>
      )}

      <section aria-label="Product" className="rounded-lg border border-line bg-surface p-5">
        {product.manufacturer && <p className="text-sm text-muted">{product.manufacturer}</p>}
        <p className="mt-1 text-2xl font-semibold leading-tight tracking-tight">{product.productName}</p>
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-4 text-sm">
          <Detail label="Form" value={product.dosageForm} />
          <Detail label="Category" value={product.category} />
          <Detail label="Active ingredients" value={product.ingredients.join(', ') || null} />
        </dl>
      </section>

      <div className="mt-3"><Sources sources={sources} /></div>

      <PackCheck
        report={report}
        reportLink={reportLink}
        hasSeriousWarning={noteworthy.some((warning) => SERIOUS_WARNINGS.has(warning.code))}
      />

      {batch && (
        <ReportSection title="Batch">
          <DetailCard>
            <Detail label="Batch number" value={batch.batchNumber} />
            <Detail label="Status" value={title(batch.status)} />
            <Detail label="Manufactured" value={formatDate(batch.manufacturingDate)} />
            <Detail label="Expires" value={formatDate(batch.expiryDate)} />
          </DetailCard>
        </ReportSection>
      )}

      {pack && (
        <ReportSection title="This pack">
          <DetailCard>
            <Detail label="Serial number" value={pack.serial} />
            <Detail label="Status" value={title(pack.status)} />
          </DetailCard>
        </ReportSection>
      )}

      {registrationReference && (
        <ReportSection title="Registration record">
          <RecordDetails record={registrationReference} />
        </ReportSection>
      )}

      <ReportSection title="What this cannot tell you">
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
          {identityLevel !== 'PACK' && <li>{explanation}</li>}
          <li>A record does not prove this pack is genuine, because a code can be copied.</li>
        </ul>
        <span className="sr-only">{notice}</span>
      </ReportSection>
    </div>
  );
}

export function ProductPage() {
  const identifier = useParams().identifier ?? '';
  const location = useLocation();
  const fromQr = useSearchParams()[0].get('qr') === '1';
  const { data, error, loading, reload } = useResource(useCallback(
    () => scanOnce(location.key, identifier),
    [location.key, identifier],
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

      {data && <LookupResult report={data} reportLink={reportLink} code={identifier} fromQr={fromQr} />}

      {!loading && (
        <div className="mt-8 flex flex-col gap-3 border-t border-line pt-6">
          <ButtonLink to="/scan">
            <QrCode aria-hidden="true" className="size-5" />
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
