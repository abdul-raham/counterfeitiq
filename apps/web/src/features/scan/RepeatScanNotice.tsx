import { Link } from 'react-router';
import { Button } from '../../components/Button';
import { StatusMessage } from '../../components/StatusMessage';
import type { ScanSignal } from '../../lib/v3/contract';

export type PanelAnswer = 'intact' | 'scratched';

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' });
}

interface RepeatScanNoticeProps {
  signal: ScanSignal;
  scannedOnlyHere: boolean;
  answer: PanelAnswer | null;
  onAnswer: (answer: PanelAnswer) => void;
  reportLink: string;
}

/**
 * The code sits under a scratch panel, so nobody should have read it before that panel was
 * scratched. A scan from this device alone is likely a rescan. A scan from elsewhere depends on
 * whether this panel was intact.
 */
export function RepeatScanNotice({ signal, scannedOnlyHere, answer, onAnswer, reportLink }: RepeatScanNoticeProps) {
  const previous = signal.totalScans - 1;
  const title = `This pack code has been scanned ${previous === 1 ? 'once' : `${previous} times`} before`;

  if (scannedOnlyHere) {
    return (
      <StatusMessage tone="neutral" title={title}>
        Only on this device, first on {formatDateTime(signal.firstSeenAt)}. This is likely your own rescan.
      </StatusMessage>
    );
  }

  return (
    <div className="space-y-3">
      <StatusMessage tone="neutral" title={title}>
        It was scanned on another device, first on {formatDateTime(signal.firstSeenAt)}.
        {!answer && (
          <div className="mt-3">
            <p className="font-medium">Was the scratch panel intact before this scan?</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => onAnswer('intact')}>Yes, it was intact</Button>
              <Button variant="secondary" onClick={() => onAnswer('scratched')}>No, it was already scratched</Button>
            </div>
          </div>
        )}
      </StatusMessage>
      {answer === 'intact' && (
        <StatusMessage tone="risk" title="High-risk duplicate" role="alert">
          This code was already scanned elsewhere while your panel was still intact, so it may have been copied onto this pack. Do not use this medicine. Show it to a pharmacist. <Link to={reportLink} className="underline underline-offset-4">See how to report a concern</Link>.
        </StatusMessage>
      )}
      {answer === 'scratched' && (
        <StatusMessage tone="warn" title="Repeated scan: ask the seller about this pack" role="status">
          The panel was already scratched, so we can't tell who scanned it or why. Ask the seller, and don't use it until a pharmacist has checked it.
        </StatusMessage>
      )}
    </div>
  );
}
