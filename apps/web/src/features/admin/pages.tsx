import { useState, type FormEvent } from 'react';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import {
  ConfirmDialog, DataTable, EmptyState, LoadingRows, PortalPage, RequestProblem, StatusBadge, TableLink, useSubmit, type Column,
} from '../../components/portal';
import { StatusMessage } from '../../components/StatusMessage';
import { formatDate } from '../../lib/format';
import {
  adminAllocations, adminAudit, adminBatches, adminEvents, adminInvestigations, adminManufacturers, adminProducts, decideApplication, listApplications, revokeCode,
} from '../../lib/v2/client';
import type {
  AuditLogEntry, Batch, CodeAllocation, Investigation, Manufacturer, ManufacturerApplication, PaginatedResponse, Product,
} from '../../lib/v2/contract';
import { useResource } from '../../lib/v2/useResource';
import { eventColumns } from '../manufacturer/pages';

function ListPage<T>({ title, description, load, columns, rowKey, empty }: {
  title: string;
  description?: string;
  load: () => Promise<PaginatedResponse<T>>;
  columns: Column<T>[];
  rowKey: (row: T) => string;
  empty: string;
}) {
  const { data, error, loading, reload } = useResource(load);
  return (
    <PortalPage title={title} description={description}>
      {loading && <LoadingRows />}
      {error !== undefined && <RequestProblem error={error} onRetry={reload} />}
      {data && (data.items.length
        ? <DataTable label={title} rows={data.items} columns={columns} rowKey={rowKey} />
        : <EmptyState title={empty} />)}
    </PortalPage>
  );
}

export function AdminDashboardPage() {
  const applications = useResource(listApplications);
  const open = applications.data?.items.filter((item) => item.status === 'SUBMITTED' || item.status === 'UNDER_REVIEW').length;
  return (
    <PortalPage title="Admin dashboard" description="What needs your attention.">
      {applications.loading && <LoadingRows />}
      {applications.error !== undefined && <RequestProblem error={applications.error} onRetry={applications.reload} />}
      {applications.data && (
        <div className="max-w-xs rounded-lg border border-line bg-surface p-4">
          <p className="text-sm text-muted">Applications waiting</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{open}</p>
          <div className="mt-2 text-sm"><TableLink to="/admin/applications">Review applications</TableLink></div>
        </div>
      )}
    </PortalPage>
  );
}

export function ApplicationsPage() {
  const { data, error, loading, reload } = useResource(listApplications);
  const { busy, error: decideError, run } = useSubmit();
  const [deciding, setDeciding] = useState<{ application: ManufacturerApplication; decision: 'APPROVE' | 'REJECT' } | null>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);

  async function handleDecide() {
    if (!deciding) return;
    if (reason.trim().length < 3) {
      setReasonError('Enter a reason. It is kept in the audit log.');
      return;
    }
    setReasonError(null);
    const done = await run(() => decideApplication(deciding.application.id, deciding.decision, reason.trim()));
    if (done) {
      setDeciding(null);
      setReason('');
      reload();
    }
  }

  const columns: Column<ManufacturerApplication>[] = [
    { header: 'Company', cell: (row) => <><p className="font-medium">{row.displayName}</p><p className="text-xs text-muted">{row.legalName}</p></> },
    { header: 'Contact', cell: (row) => row.contactEmail },
    { header: 'Status', cell: (row) => <StatusBadge status={row.status} /> },
    {
      header: 'Decision',
      cell: (row) => (row.status === 'SUBMITTED' || row.status === 'UNDER_REVIEW' ? (
        <div className="flex gap-3">
          <button type="button" aria-label={`Approve ${row.displayName}`} className="rounded-sm font-medium underline underline-offset-4" onClick={() => setDeciding({ application: row, decision: 'APPROVE' })}>Approve</button>
          <button type="button" aria-label={`Reject ${row.displayName}`} className="rounded-sm font-medium text-risk underline underline-offset-4" onClick={() => setDeciding({ application: row, decision: 'REJECT' })}>Reject</button>
        </div>
      ) : row.decisionReason ?? ''),
    },
  ];

  return (
    <PortalPage title="Applications" description="Approving a company lets it issue codes here. It does not assert regulatory approval.">
      {loading && <LoadingRows />}
      {error !== undefined && <RequestProblem error={error} onRetry={reload} />}
      {data && (data.items.length
        ? <DataTable label="Applications" rows={data.items} columns={columns} rowKey={(row) => row.id} />
        : <EmptyState title="No applications" />)}
      {deciding && (
        <ConfirmDialog
          title={`${deciding.decision === 'APPROVE' ? 'Approve' : 'Reject'} ${deciding.application.displayName}?`}
          confirmLabel={deciding.decision === 'APPROVE' ? 'Approve company' : 'Reject company'}
          busy={busy}
          onCancel={() => {
            setDeciding(null);
            setReasonError(null);
          }}
          onConfirm={() => void handleDecide()}
        >
          <Input label="Reason" value={reason} error={reasonError} onChange={(event) => setReason(event.target.value)} />
          {decideError !== null && <div className="mt-3"><RequestProblem error={decideError} /></div>}
        </ConfirmDialog>
      )}
    </PortalPage>
  );
}

export function AdminManufacturersPage() {
  const columns: Column<Manufacturer>[] = [
    { header: 'Company', cell: (row) => row.displayName },
    { header: 'Legal name', cell: (row) => row.legalName },
    { header: 'Status', cell: (row) => <StatusBadge status={row.status} /> },
  ];
  return <ListPage title="Manufacturers" load={adminManufacturers} columns={columns} rowKey={(row) => row.id} empty="No manufacturers" />;
}

export function AdminProductsPage() {
  const columns: Column<Product>[] = [
    { header: 'Product', cell: (row) => row.name },
    { header: 'NAFDAC number', cell: (row) => row.nafdacNumber ?? '' },
    { header: 'Status', cell: (row) => <StatusBadge status={row.status} /> },
  ];
  return <ListPage title="Product claims" description="Claims made by manufacturers, for review." load={adminProducts} columns={columns} rowKey={(row) => row.id} empty="No product claims" />;
}

export function AdminBatchesPage() {
  const columns: Column<Batch>[] = [
    { header: 'Batch', cell: (row) => row.batchNumber },
    { header: 'Expires', cell: (row) => formatDate(row.expiryDate) ?? '' },
    { header: 'Status', cell: (row) => <StatusBadge status={row.status} /> },
  ];
  return <ListPage title="Batches" load={adminBatches} columns={columns} rowKey={(row) => row.id} empty="No batches" />;
}

export function AdminAllocationsPage() {
  const { busy, error, run } = useSubmit();
  const [codeId, setCodeId] = useState('');
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [revoked, setRevoked] = useState<string | null>(null);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!codeId.trim() || reason.trim().length < 3) {
      setProblem('Enter the code ID and a reason.');
      return;
    }
    setProblem(null);
    setRevoked(null);
    setConfirming(true);
  }

  async function handleRevoke() {
    let succeeded = false;
    await run(async () => {
      await revokeCode(codeId.trim(), reason.trim());
      succeeded = true;
    });
    setConfirming(false);
    if (succeeded) {
      setRevoked(codeId.trim());
      setCodeId('');
      setReason('');
    }
  }

  const columns: Column<CodeAllocation>[] = [
    { header: 'Allocation', cell: (row) => row.id },
    { header: 'Quantity', cell: (row) => row.quantity.toLocaleString() },
    { header: 'Status', cell: (row) => <StatusBadge status={row.status} /> },
  ];

  return (
    <div>
      <ListPage title="Code allocations" load={adminAllocations} columns={columns} rowKey={(row) => row.id} empty="No allocations" />
      <section aria-labelledby="revoke-code" className="mt-8 max-w-xl">
        <h2 id="revoke-code" className="text-lg font-semibold tracking-tight">Revoke a code</h2>
        <p className="mt-1 text-sm text-muted">The public will see this code as revoked. The action is recorded in the audit log.</p>
        <form onSubmit={handleSubmit} noValidate className="mt-3 space-y-4">
          {problem && <StatusMessage tone="warn" title="Check the details" role="alert">{problem}</StatusMessage>}
          {error !== null && <RequestProblem error={error} />}
          {revoked && <StatusMessage tone="accent" title="Code revoked" role="status">Code {revoked} has been revoked.</StatusMessage>}
          <Input label="Code ID" value={codeId} onChange={(event) => setCodeId(event.target.value)} />
          <Input label="Reason" value={reason} onChange={(event) => setReason(event.target.value)} />
          <Button type="submit" variant="secondary">Revoke code</Button>
        </form>
      </section>
      {confirming && (
        <ConfirmDialog title={`Revoke code ${codeId}?`} confirmLabel="Revoke code" busy={busy} onCancel={() => setConfirming(false)} onConfirm={() => void handleRevoke()}>
          Anyone who checks this code will be told it has been revoked.
        </ConfirmDialog>
      )}
    </div>
  );
}

export function AdminEventsPage() {
  return <ListPage title="Verification events" description="Repeat and invalid checks are signals to look into, not proof of counterfeiting." load={adminEvents} columns={eventColumns} rowKey={(row) => row.id} empty="No events" />;
}

export function AdminInvestigationsPage() {
  const columns: Column<Investigation>[] = [
    { header: 'Reference', cell: (row) => row.id },
    { header: 'Pack', cell: (row) => row.publicIdentifier ?? 'Not given' },
    { header: 'Received', cell: (row) => new Date(row.createdAt).toLocaleString() },
  ];
  return <ListPage title="Investigations" load={adminInvestigations} columns={columns} rowKey={(row) => row.id} empty="No investigations" />;
}

export function AdminAuditPage() {
  const columns: Column<AuditLogEntry>[] = [
    { header: 'When', cell: (row) => new Date(row.occurredAt).toLocaleString() },
    { header: 'Action', cell: (row) => row.action },
    { header: 'Item', cell: (row) => `${row.entityType} ${row.entityId ?? ''}` },
  ];
  return <ListPage title="Audit log" load={adminAudit} columns={columns} rowKey={(row) => row.id} empty="No audit entries" />;
}
