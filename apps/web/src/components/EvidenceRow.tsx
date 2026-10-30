import type { FieldMatch } from '@counterfeitiq/shared';
import { Check, Minus, X, type LucideIcon } from 'lucide-react';

const statuses: Record<FieldMatch, { label: string; className: string; icon: LucideIcon }> = {
  MATCH: { label: 'Matches', className: 'text-ok', icon: Check },
  MISMATCH: { label: 'Differs', className: 'text-risk', icon: X },
  UNKNOWN: { label: "Can't compare", className: 'text-muted', icon: Minus },
};

interface EvidenceRowProps {
  label: string;
  packValue: string | null;
  recordValue?: string | null;
  showRecord?: boolean;
  status?: FieldMatch | null;
}

function Value({ value }: { value: string | null | undefined }) {
  return value
    ? <dd className="mt-0.5 break-words font-medium">{value}</dd>
    : <dd className="mt-0.5 text-muted">Not available</dd>;
}

export function EvidenceRow({ label, packValue, recordValue, showRecord = false, status }: EvidenceRowProps) {
  const state = status ? statuses[status] : null;
  return (
    <div className={`px-4 py-3.5 ${status === 'MISMATCH' ? 'bg-risk-soft' : ''}`}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm text-muted">{label}</h3>
        {state && (
          <p className={`inline-flex shrink-0 items-center gap-1 text-sm font-medium ${state.className}`}>
            <state.icon aria-hidden="true" className="size-4" />
            {state.label}
          </p>
        )}
      </div>
      <dl className={`mt-2 grid gap-3 ${showRecord ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <div>
          <dt className="text-xs text-muted">On the pack</dt>
          <Value value={packValue} />
        </div>
        {showRecord && (
          <div>
            <dt className="text-xs text-muted">On the record</dt>
            <Value value={recordValue} />
          </div>
        )}
      </dl>
    </div>
  );
}
