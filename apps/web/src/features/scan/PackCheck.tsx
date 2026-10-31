import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/Button';
import { StatusMessage } from '../../components/StatusMessage';
import { formatDate } from '../../lib/format';
import type { ProductReport } from '../../lib/v3/contract';
import { RepeatScanNotice, type PanelAnswer } from './RepeatScanNotice';

type MatchAnswer = 'yes' | 'no' | 'unsure';

/** A pharmacist can only help with a medicine. This check also covers water, food and other products. */
export function whatToDoWithIt(report: ProductReport): string {
  return report.product?.category === 'medicine' ? 'Show it to a pharmacist.' : 'Keep the package and your receipt.';
}

function checklist({ product, batch, registrationReference: registration }: ProductReport) {
  const rows: [string, string | null | undefined][] = [
    ['Product name', product?.productName],
    ['Brand', product?.brand],
    ['Batch', batch?.batchNumber],
    ['Expiry', formatDate(batch?.expiryDate ?? null)],
    ['Pack size', product?.packSize ?? registration?.packSize],
    ['Manufacturer', product?.manufacturer ?? registration?.listedManufacturer],
    ['Applicant', registration?.applicant],
    ['NAFDAC number', product?.nafdacNumber],
  ];
  return rows.filter((row): row is [string, string] => Boolean(row[1]));
}

interface FinalResultProps {
  care: string;
  isMedicine: boolean;
  match: MatchAnswer;
  mismatches: string[];
  panel: PanelAnswer | null;
  hasSeriousWarning: boolean;
  reportLink: string;
}

function FinalResult({ care, isMedicine, match, mismatches, panel, hasSeriousWarning, reportLink }: FinalResultProps) {
  const report = <Link to={reportLink} className="underline underline-offset-4">See how to report a concern</Link>;
  if (match === 'no') {
    return (
      <StatusMessage tone="risk" title="This package does not match the record" role="status">
        {mismatches.length > 0 && <>What differs: {mismatches.join(', ')}. </>}
        Do not use this product. {care} {report}.
      </StatusMessage>
    );
  }
  if (panel === 'notMine') {
    return (
      <StatusMessage tone="risk" title="Do not use this pack" role="status">
        Whatever the package says, its hidden code was already scanned elsewhere. {care} {report}.
      </StatusMessage>
    );
  }
  if (match === 'unsure') {
    return (
      <StatusMessage tone="warn" title={`Ask ${isMedicine ? 'a pharmacist' : 'the seller'} to compare`} role="status">
        Show them this page and the package before using it.
      </StatusMessage>
    );
  }
  if (hasSeriousWarning) {
    return <StatusMessage tone="warn" title="The details match, but see the warning above" role="status" />;
  }
  return (
    <StatusMessage tone="ok" title="The details match the manufacturer's record" role="status">
      We found nothing wrong in this check. A QR code can be copied, so this can't prove what is inside the pack.
    </StatusMessage>
  );
}

export function PackCheck({ report, reportLink, hasSeriousWarning }: { report: ProductReport; reportLink: string; hasSeriousWarning: boolean }) {
  const [panel, setPanel] = useState<PanelAnswer | null>(null);
  const [match, setMatch] = useState<MatchAnswer | null>(null);
  const [mismatches, setMismatches] = useState<string[]>([]);
  const rows = checklist(report);
  const care = whatToDoWithIt(report);
  // A repeat only means something for one serialized pack. Every pack of a product shares its product code.
  const repeat = report.identityLevel === 'PACK' && report.scanSignal && report.scanSignal.totalScans > 1 ? report.scanSignal : null;
  const scannedOnlyHere = repeat?.distinctDevices === 1;
  const waitingForPanel = Boolean(repeat) && !scannedOnlyHere && !panel;

  function toggleMismatch(label: string) {
    setMismatches((current) => (current.includes(label) ? current.filter((item) => item !== label) : [...current, label]));
  }

  return (
    <div className="mt-3 space-y-3">
      {repeat && <RepeatScanNotice care={care} signal={repeat} scannedOnlyHere={scannedOnlyHere} answer={panel} onAnswer={setPanel} reportLink={reportLink} />}

      <section aria-labelledby="pack-check" className="rounded-lg border border-line bg-surface p-5">
        <h2 id="pack-check" className="font-semibold">Check the package in your hand</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {rows.map(([label, value]) => (
            <li key={label}>
              <label className="flex items-start gap-2.5">
                <input type="checkbox" className="mt-0.5 size-4 shrink-0" />
                <span className="min-w-0 break-words">{label}: {value}</span>
              </label>
            </li>
          ))}
        </ul>
        <p className="mt-4 font-medium">Does your package match all of these?</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button variant={match === 'yes' ? 'primary' : 'secondary'} aria-pressed={match === 'yes'} onClick={() => setMatch('yes')}>Yes</Button>
          <Button variant={match === 'no' ? 'primary' : 'secondary'} aria-pressed={match === 'no'} onClick={() => setMatch('no')}>No</Button>
          <Button variant={match === 'unsure' ? 'primary' : 'secondary'} aria-pressed={match === 'unsure'} onClick={() => setMatch('unsure')}>I'm not sure</Button>
        </div>
        {match === 'no' && (
          <fieldset className="mt-4">
            <legend className="font-medium">What doesn't match?</legend>
            <div className="mt-2 space-y-2 text-sm">
              {[...rows.map(([label]) => label), 'Something else'].map((label) => (
                <label key={label} className="flex items-center gap-2.5">
                  <input type="checkbox" className="size-4 shrink-0" checked={mismatches.includes(label)} onChange={() => toggleMismatch(label)} />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
        )}
      </section>

      {match && waitingForPanel && match !== 'no' && (
        <p className="text-sm text-muted">Tell us about the scratch panel above to see your result.</p>
      )}
      {match && (!waitingForPanel || match === 'no') && (
        <FinalResult care={care} isMedicine={report.product?.category === 'medicine'} match={match} mismatches={mismatches} panel={panel} hasSeriousWarning={hasSeriousWarning} reportLink={reportLink} />
      )}
    </div>
  );
}
