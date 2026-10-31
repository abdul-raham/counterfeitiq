import type { ReferenceLookupResult } from '@counterfeitiq/shared';
import { ExternalLink } from 'lucide-react';
import { StatusMessage } from '../../components/StatusMessage';
import { isSampleMode } from '../../lib/api';
import { formatDate, safeExternalUrl } from '../../lib/format';
import { unavailableReason } from './outcome';

export function SourceNotice({ reference }: { reference: ReferenceLookupResult | null }) {
  if (isSampleMode()) {
    return (
      <StatusMessage tone="warn" title="Sample data">
        This result is fictional. Nothing here came from NAFDAC.
      </StatusMessage>
    );
  }

  if (!reference) {
    return <p className="text-sm text-muted">Source: no registration source was checked.</p>;
  }

  const { provenance } = reference;

  // Checked first: an unavailable lookup has no record, whatever mode it ran in.
  if (reference.status === 'SOURCE_UNAVAILABLE') {
    return (
      <p className="text-sm text-muted">
        Source: {unavailableReason[provenance.mode]}.
        {provenance.note && ` ${provenance.note}`}
      </p>
    );
  }

  if (provenance.mode === 'DEMO_FIXTURE') {
    return (
      <StatusMessage tone="warn" title="Demonstration record, not live NAFDAC data">
        This record is included for demonstration only and must not be relied on.
        {provenance.note && <span className="mt-1 block text-muted">{provenance.note}</span>}
      </StatusMessage>
    );
  }

  const url = safeExternalUrl(provenance.sourceUrl);
  return (
    <p className="text-sm text-muted">
      Source: live NAFDAC Greenbook lookup
      {provenance.requestedAt && `, checked ${formatDate(provenance.requestedAt)}`}.
      {' '}Experimental, low-volume lookup of NAFDAC's public Greenbook. Not endorsed by NAFDAC.
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
