import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/Button';
import { StatusMessage } from '../../components/StatusMessage';
import type { ScanSignal } from '../../lib/v3/contract';

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' });
}

/**
 * A code can be read through closed packaging, and shops and pharmacists scan packs too, so a
 * repeat alone proves nothing. Whether the pack is sealed decides the useful next step.
 */
export function RepeatScanNotice({ signal, reportLink }: { signal: ScanSignal; reportLink: string }) {
  const [answer, setAnswer] = useState<'sealed' | 'opened' | null>(null);
  const previous = signal.totalScans - 1;

  return (
    <div className="space-y-3">
      <StatusMessage tone="neutral" title={`This pack code has been scanned ${previous === 1 ? 'once' : `${previous} times`} before`}>
        First scanned {formatDateTime(signal.firstSeenAt)}. If that wasn't you, it could have been a shop, a pharmacist or another shopper, so this alone does not mean the product is fake.
        {!answer && (
          <div className="mt-3">
            <p className="font-medium">Is this pack still sealed?</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setAnswer('sealed')}>Yes, it's sealed</Button>
              <Button variant="secondary" onClick={() => setAnswer('opened')}>No, it's been opened</Button>
            </div>
          </div>
        )}
      </StatusMessage>
      {answer === 'sealed' && (
        <StatusMessage tone="warn" title="Have this pack checked before using it" role="status">
          If nobody you know scanned this sealed pack, its code may have been copied onto another pack. That's not certain, so show it to a pharmacist. <Link to={reportLink} className="underline underline-offset-4">See how to report a concern</Link>.
        </StatusMessage>
      )}
      {answer === 'opened' && (
        <StatusMessage tone="warn" title="Ask the seller about this pack" role="status">
          If you didn't open it, it may have been opened or resold before you bought it. Ask the seller, and don't use it until a pharmacist has checked it.
        </StatusMessage>
      )}
    </div>
  );
}
