import type { ReferenceLookupResult } from '@counterfeitiq/shared';
import { ExternalLink } from 'lucide-react';
import { StatusMessage } from '../../components/StatusMessage';
import { isSampleMode } from '../../lib/api';
import { formatDate, safeExternalUrl } from '../../lib/format';

export function SourceNotice({ reference }: { reference: ReferenceLookupResult | null }) {
  if (isSampleMode()) {
    return (
      <StatusMessage tone="warn" title="Sample data">
        This result is fictional. Nothing here came from NAFDAC.
      </StatusMessage>
    );
  }

  if (!reference || reference.provenance.mode === 'NOT_EXECUTED' && reference.status !== 'SOURCE_UNAVAILABLE') {
    return <p className="text-sm text-muted">Source: no registration source was checked.</p>;
  }

  const { provenance } = reference;

  if (provenance.mode === 'DEMO_FIXTURE') {
    return (
      <StatusMessage tone="warn" title="Demonstration record, not live NAFDAC data">
        This record is included for demonstration only and must not be relied on.
        {provenance.note && <span className="mt-1 block text-muted">{provenance.note}</span>}
      </StatusMessage>
    );
  }

  if (reference.status === 'SOURCE_UNAVAILABLE') {
    return (
      <p className="text-sm text-muted">
        Source: the registration source could not be reached.
        {provenance.note && ` ${provenance.note}`}
      </p>
    );
  }

  const url = safeExternalUrl(provenance.sourceUrl);
  return (
    <p className="text-sm text-muted">
      Source: live NAFDAC Greenbook lookup
      {provenance.requestedAt && `, checked ${formatDate(provenance.requestedAt)}`}.
      {provenance.note && ` ${provenance.note}`}
      {url && (
        <>
          {' '}
          <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-sm underline underline-offset-4 hover:text-ink">
            View source
            <ExternalLink aria-hidden="true" className="size-3.5" />
          </a>
        </>
      )}
    </p>
  );
}
