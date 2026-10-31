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
  care: string;
  signal: ScanSignal;
  scannedOnlyHere: boolean;
  answer: PanelAnswer | null;
  onAnswer: (answer: PanelAnswer) => void;
  reportLink: string;
}

/**
 * The code sits under a scratch panel, so nobody should have read it before that panel was
 * scratched. A scan from this device alone is likely a rescan. A scan from elsewhere depends on
 * who scratched this panel.
 */
export function RepeatScanNotice({ care, signal, scannedOnlyHere, answer, onAnswer, reportLink }: RepeatScanNoticeProps) {
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
            <p className="font-medium">Did you scratch this panel yourself?</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => onAnswer('intact')}>I've scratched it</Button>
              <Button variant="secondary" onClick={() => onAnswer('scratched')}>I haven't, it came scratched</Button>
            </div>
          </div>
        )}
      </StatusMessage>
      {answer === 'intact' && (
        <StatusMessage tone="risk" title="High-risk duplicate" role="alert">
          You scratched this panel yourself, but the code under it was already scanned elsewhere, so it may have been copied onto this pack. Do not use this product. {care} <Link to={reportLink} className="underline underline-offset-4">See how to report a concern</Link>.
        </StatusMessage>
      )}
      {answer === 'scratched' && (
        <StatusMessage tone="warn" title="Repeated scan: ask the seller about this pack" role="status">
          It came scratched, so we can't tell who scanned it or why. Ask the seller, and don't use it until you have an answer.
        </StatusMessage>
      )}
    </div>
  );
}
