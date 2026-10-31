import type { AnalysisResponse, InvestigationReport } from '@counterfeitiq/shared';
import { motion } from 'motion/react';
import { toneStyles } from '../../components/StatusMessage';
import { EvidenceRow } from '../../components/EvidenceRow';
import { ImagePreview } from '../../components/ImagePreview';
import { ReportSection } from '../../components/ReportSection';
import { StatusMessage } from '../../components/StatusMessage';
import { formatDate } from '../../lib/format';
import { SourceNotice } from './SourceNotice';
import { buildComparisonRows, describeOutcome, nothingWasRead, registrationWarning, unreadFields } from './outcome';

type ExpiryStatus = InvestigationReport['packageExpiryStatus'];

const expiryLabels: Record<ExpiryStatus, { label: string; className: string }> = {
  EXPIRED: { label: 'Date has passed', className: 'text-risk' },
  NOT_EXPIRED: { label: 'Date has not passed', className: 'text-ok' },
  UNKNOWN: { label: 'Could not be determined', className: 'text-muted' },
};

function ExpiryCell({ title, source, date, status }: { title: string; source: string; date: string | null; status: ExpiryStatus }) {
  const { label, className } = expiryLabels[status];
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <h3 className="font-medium">{title}</h3>
      <p className="text-sm text-muted">{source}</p>
      <p className="mt-3 text-lg font-medium">{formatDate(date) ?? 'Not available'}</p>
      <p className={`text-sm font-medium ${className}`}>{label}</p>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="break-words font-medium">{value}</dd>
    </div>
  );
}

export function Report({ response, imageUrl }: { response: AnalysisResponse; imageUrl: string | null }) {
  const { extracted, reference, verification } = response;
  const outcome = describeOutcome(response);
  const tone = toneStyles[outcome.tone];
  const record = reference?.status === 'FOUND' ? reference.record : null;
  const recordName = record && reference?.provenance.mode === 'DEMO_FIXTURE' ? 'demonstration record' : 'registration record';
  const warning = registrationWarning(reference);
  const rows = buildComparisonRows(response);
  const differences = verification.findings.filter((finding) => finding.status === 'MISMATCH');
  const uncertain = verification.findings.filter((finding) => finding.status === 'UNKNOWN' && finding.referenceValue !== null);
  const unread = unreadFields(extracted);
  const unreadable = nothingWasRead(extracted);
  const category = extracted.category && extracted.category.charAt(0).toUpperCase() + extracted.category.slice(1);
  const printedWarnings = extracted.printedWarnings ?? [];
  const hasPrintedDetails = Boolean(extracted.dosageForm || extracted.packSize || extracted.directions || extracted.storage || printedWarnings.length);
  const hasRecordDetails = Boolean(record && (record.applicant || record.packSize || record.registrationStatus || record.productCategory || record.dosageForm || record.route || record.approvalDate));

  return (
    <div>
      <motion.section
        aria-label="Summary"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className={`mt-5 rounded-lg border p-5 sm:p-6 ${tone.box}`}
      >
        <tone.icon aria-hidden="true" className={`size-6 ${tone.text}`} />
        <p className={`mt-3 text-2xl font-semibold leading-tight tracking-tight ${tone.text}`}>{outcome.title}</p>
        <p className="mt-2 leading-relaxed">{verification.summary}</p>
        {outcome.caveat && <p className="mt-3 border-t border-ink/10 pt-3 text-sm leading-relaxed">{outcome.caveat}</p>}
      </motion.section>

      {verification.packageExpiryStatus === 'EXPIRED' && (
        <div className="mt-3">
          <StatusMessage tone="risk" title="The expiry date printed on this pack has passed" />
        </div>
      )}

      {warning && (
        <div className="mt-3">
          <StatusMessage tone="risk" title={warning}>
            Check the current registration status with NAFDAC before using this product.
          </StatusMessage>
        </div>
      )}

      {verification.registrationExpiryStatus === 'EXPIRED' && (
        <div className="mt-3">
          <StatusMessage tone="warn" title={`The expiry date on the ${recordName} has passed`}>
            Confirm the current registration status with NAFDAC.
          </StatusMessage>
        </div>
      )}

      <div className="mt-4"><SourceNotice reference={reference} /></div>

      {differences.length > 0 && (
        <ReportSection title="What differs">
          <ul className="list-disc space-y-1.5 pl-5 leading-relaxed">
            {differences.map((finding) => <li key={finding.code}>{finding.explanation}</li>)}
          </ul>
        </ReportSection>
      )}

      {unreadable ? (
        imageUrl && (
          <ReportSection title="The photo you scanned">
            <ImagePreview src={imageUrl} alt="The photo you scanned" />
          </ReportSection>
        )
      ) : (
        <>
          <ReportSection title="The product we read">
            <div className="flex gap-4 rounded-lg border border-line bg-surface p-4">
              {imageUrl && (
                <img src={imageUrl} alt="The photo you scanned" className="size-24 shrink-0 rounded-md border border-line object-cover sm:size-32" />
              )}
              <dl className="grid min-w-0 flex-1 grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <Detail label="Product" value={extracted.productName} />
                <Detail label="Category" value={category} />
                <Detail label="Brand" value={extracted.brand} />
                <Detail label="Manufacturer" value={extracted.manufacturer} />
                <Detail label="Form" value={extracted.dosageForm} />
                <Detail label="Pack size" value={extracted.packSize} />
                <Detail label="Batch number" value={extracted.batchNumber} />
                <Detail label="Manufacturing date" value={formatDate(extracted.manufacturingDate)} />
              </dl>
            </div>
          </ReportSection>

          <ReportSection title={record ? `Pack compared with the ${recordName}` : 'Details on the pack'}>
            <div className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
              {rows.map((row) => (
                <EvidenceRow
                  key={row.key}
                  label={row.label}
                  packValue={row.packValue}
                  recordValue={row.recordValue}
                  showRecord={Boolean(record)}
                  status={row.status}
                />
              ))}
            </div>
          </ReportSection>

          {record && hasRecordDetails && (
            <ReportSection title={`On the ${recordName}`}>
              <dl className="grid grid-cols-1 gap-3 rounded-lg border border-line bg-surface p-4 text-sm sm:grid-cols-2">
                <Detail label="Applicant" value={record.applicant} />
                <Detail label="Status" value={record.registrationStatus} />
                <Detail label="Pack size" value={record.packSize} />
                <Detail label="Category" value={record.productCategory} />
                <Detail label="Form" value={record.dosageForm} />
                <Detail label="Route" value={record.route} />
                <Detail label="Approved" value={formatDate(record.approvalDate ?? null)} />
              </dl>
            </ReportSection>
          )}

          {(extracted.directions || extracted.storage || printedWarnings.length > 0) && hasPrintedDetails && (
            <ReportSection title="As printed on the pack">
              <div className="space-y-3 rounded-lg border border-line bg-surface p-4 text-sm leading-relaxed">
                {extracted.directions && <div><h3 className="text-xs text-muted">Directions</h3><p className="font-medium">{extracted.directions}</p></div>}
                {extracted.storage && <div><h3 className="text-xs text-muted">Storage</h3><p className="font-medium">{extracted.storage}</p></div>}
                {printedWarnings.length > 0 && (
                  <div>
                    <h3 className="text-xs text-muted">Warnings on the pack</h3>
                    <ul className="list-disc pl-5 font-medium">
                      {printedWarnings.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            </ReportSection>
          )}

          <ReportSection title="Expiry dates">
            <div className={`grid gap-3 ${record ? 'sm:grid-cols-2' : ''}`}>
              <ExpiryCell
                title="Printed pack expiry"
                source="Read from the packaging"
                date={extracted.expiryDate}
                status={verification.packageExpiryStatus}
              />
              {record && (
                <ExpiryCell
                  title="Registration expiry"
                  source={`From the ${recordName}`}
                  date={record.registrationExpiry}
                  status={verification.registrationExpiryStatus}
                />
              )}
            </div>
          </ReportSection>
        </>
      )}

      {!unreadable && (uncertain.length > 0 || unread.length > 0) && (
        <ReportSection title="What we could not confirm">
          <ul className="list-disc space-y-1.5 pl-5 leading-relaxed">
            {uncertain.map((finding) => <li key={finding.code}>{finding.explanation}</li>)}
            {unread.length > 0 && <li>Not readable on the pack: {unread.join(', ')}.</li>}
          </ul>
        </ReportSection>
      )}

      {verification.recommendedActions.length > 0 && (
        <ReportSection title="What to do next">
          <ol className="list-decimal space-y-1.5 pl-5 leading-relaxed">
            {verification.recommendedActions.map((action) => <li key={action}>{action}</li>)}
          </ol>
        </ReportSection>
      )}
    </div>
  );
}
