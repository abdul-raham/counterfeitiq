import { useEffect, useId, useRef, useState, type ReactNode, type SelectHTMLAttributes } from 'react';
import { Link } from 'react-router';
import { ErrorState } from './ErrorState';
import { Button } from './Button';
import { Skeleton } from './Skeleton';
import { StatusMessage, type Tone } from './StatusMessage';
import { toRequestError } from '../lib/errors';
import { EndpointNotInContractError, ForbiddenError, SignInRequiredError } from '../lib/v2/client';
import { useDocumentTitle } from '../lib/useDocumentTitle';

export function PortalPage({ title, description, actions, children }: { title: string; description?: string; actions?: ReactNode; children: ReactNode }) {
  useDocumentTitle(title);
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 tabIndex={-1} className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
          {description && <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      <div className="mt-6">{children}</div>
    </div>
  );
}

/** Shown when a screen's endpoint does not exist yet, instead of pretending it worked. */
export function NotConnected({ endpoint, what }: { endpoint: string; what?: string }) {
  return (
    <StatusMessage tone="neutral" title="Not connected yet">
      {what ?? 'This screen is ready, but the server does not provide this data yet.'} It needs <code className="rounded-sm bg-canvas px-1 py-0.5 text-xs">{endpoint}</code>.
    </StatusMessage>
  );
}

export function RequestProblem({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  if (error instanceof EndpointNotInContractError) return <NotConnected endpoint={error.endpoint} />;
  if (error instanceof SignInRequiredError) {
    return <StatusMessage tone="warn" title="Please sign in" role="alert">Your session has ended or you are not signed in.</StatusMessage>;
  }
  if (error instanceof ForbiddenError) {
    return <StatusMessage tone="warn" title="You do not have access" role="alert">Your account is not permitted to do this.</StatusMessage>;
  }
  const requestError = toRequestError(error);
  return (
    <ErrorState error={requestError}>
      {requestError.retryable && onRetry && <Button variant="secondary" onClick={onRetry}>Try again</Button>}
    </ErrorState>
  );
}

export function LoadingRows() {
  return (
    <div role="status" className="space-y-2">
      <span className="sr-only">Loading</span>
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-[#b9c3cf] bg-surface px-5 py-10 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-muted">{children}</div>}
    </div>
  );
}

export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
}

export function DataTable<T>({ label, rows, columns, rowKey }: { label: string; rows: T[]; columns: Column<T>[]; rowKey: (row: T) => string }) {
  return (
    <div role="region" aria-label={label} tabIndex={0} className="overflow-x-auto rounded-lg border border-line bg-surface">
      <table className="w-full min-w-[32rem] text-left text-sm">
        <caption className="sr-only">{label}</caption>
        <thead className="border-b border-line text-xs text-muted">
          <tr>{columns.map((column) => <th key={column.header} scope="col" className="px-4 py-2.5 font-medium">{column.header}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => (
            <tr key={rowKey(row)}>{columns.map((column) => <td key={column.header} className="px-4 py-3 align-top">{column.cell(row)}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const STATUS_TONES: Record<string, Tone> = {
  ACTIVE: 'ok', APPROVED: 'ok', GENERATED: 'neutral', DRAFT: 'neutral', SUBMITTED: 'neutral', UNDER_REVIEW: 'neutral', PENDING: 'neutral',
  EXPIRED: 'warn', RETIRED: 'warn', SUSPENDED: 'warn', CANCELLED: 'warn', INACTIVE: 'warn',
  BLOCKED: 'risk', RECALLED: 'risk', REJECTED: 'risk', REVOKED: 'risk',
};
const TONE_TEXT: Record<Tone, string> = { ok: 'text-ok', warn: 'text-warn', risk: 'text-risk', neutral: 'text-muted', accent: 'text-accent' };

/** Plain text with a coloured dot, so status never relies on colour alone. */
export function StatusBadge({ status }: { status: string }) {
  const tone = TONE_TEXT[STATUS_TONES[status] ?? 'neutral'];
  const label = status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, ' ');
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap font-medium ${tone}`}>
      <span aria-hidden="true" className="size-1.5 bg-current" />
      {label}
    </span>
  );
}

export function TableLink({ to, children }: { to: string; children: ReactNode }) {
  return <Link to={to} className="rounded-sm font-medium underline underline-offset-4">{children}</Link>;
}

export function Select({ label, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">{label}</label>
      <select id={id} className="mt-2 block min-h-12 w-full rounded-lg border border-line bg-surface px-3 text-base" {...props}>{children}</select>
    </div>
  );
}

interface ConfirmDialogProps {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ title, children, confirmLabel, busy, onConfirm, onCancel }: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog?.showModal && !dialog.open) dialog.showModal();
    return () => dialog?.close?.();
  }, []);

  return (
    <dialog
      ref={ref}
      open={typeof HTMLDialogElement === 'undefined' || !HTMLDialogElement.prototype.showModal ? true : undefined}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-lg border border-line bg-surface p-5 text-ink backdrop:bg-ink/40"
    >
      <h2 id={titleId} className="text-lg font-semibold tracking-tight">{title}</h2>
      <div className="mt-2 text-sm leading-relaxed">{children}</div>
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button onClick={onConfirm} disabled={busy}>{busy ? 'Working' : confirmLabel}</Button>
      </div>
    </dialog>
  );
}

export function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  async function run<T>(action: () => Promise<T>): Promise<T | undefined> {
    setBusy(true);
    setError(null);
    try {
      return await action();
    } catch (caught) {
      setError(caught);
      return undefined;
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, run };
}
