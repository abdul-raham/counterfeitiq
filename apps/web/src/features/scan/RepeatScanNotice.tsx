import { Link } from 'react-router';
import { Button } from '../../components/Button';
import { StatusMessage } from '../../components/StatusMessage';
import type { ScanSignal } from '../../lib/v3/contract';

export type PanelAnswer = 'mine' | 'notMine';

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
 * scratched. A scan from this device alone is likely a rescan. A scan from elsewhere is yours only
 * if you scratched this panel earlier. Otherwise someone else read the code first.
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
            <p className="font-medium">Was this panel previously scratched by you?</p>
            <p className="mt-0.5 text-muted">Choose No if you only just scratched it, or it came scratched.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => onAnswer('mine')}>Yes, I scratched it earlier</Button>
              <Button variant="secondary" onClick={() => onAnswer('notMine')}>No, I didn't</Button>
            </div>
          </div>
        )}
      </StatusMessage>
      {answer === 'notMine' && (
        <StatusMessage tone="risk" title="High-risk duplicate" role="alert">
          You didn't scratch this panel earlier, but the code under it was already scanned on another device, so it may have been copied onto this pack. Do not use this product. {care} <Link to={reportLink} className="underline underline-offset-4">See how to report a concern</Link>.
        </StatusMessage>
      )}
      {answer === 'mine' && (
        <StatusMessage tone="neutral" title="This is likely your own earlier scan" role="status">
          You scratched this panel earlier, so the other scan was probably you on another device.
        </StatusMessage>
      )}
    </div>
  );
}
