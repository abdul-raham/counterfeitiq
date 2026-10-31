import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { Plus, Printer } from 'lucide-react';
import { Button, ButtonLink } from '../../components/Button';
import { Input } from '../../components/Input';
import {
  ConfirmDialog, DataTable, EmptyState, LoadingRows, NotConnected, PortalPage, RequestProblem, Select, StatusBadge, TableLink, useSubmit, type Column,
} from '../../components/portal';
import { StatusMessage } from '../../components/StatusMessage';
import { isSampleMode } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import {
  activateAllocation, createAllocation, createBatch, createProduct, getManufacturerProfile, listAllocations, listBatches, listManufacturerEvents, listProducts, submitApplication,
} from '../../lib/v2/client';
import type { Batch, CodeAllocation, ManufacturerApplication, Product, VerificationEvent } from '../../lib/v2/contract';
import { useResource } from '../../lib/v2/useResource';
import { DemoLabels } from './DemoLabels';

function outcomeLabel(outcome: string) {
  return outcome.charAt(0) + outcome.slice(1).toLowerCase().replace(/_/g, ' ');
}

export const eventColumns: Column<VerificationEvent>[] = [
  { header: 'When', cell: (row) => new Date(row.occurredAt).toLocaleString() },
  { header: 'Pack', cell: (row) => row.publicIdentifier ?? 'Unknown' },
  { header: 'Result', cell: (row) => outcomeLabel(row.outcome) },
];

// ----- Application -----

export function ApplyPage() {
  useDocumentTitle('Apply as a manufacturer');
  const navigate = useNavigate();
  const { busy, error, run } = useSubmit();
  const [form, setForm] = useState({ legalName: '', displayName: '', registrationNumber: '', nafdacManufacturerNumber: '', contactEmail: '', contactPhone: '' });
  const [invalid, setInvalid] = useState(false);
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm({ ...form, [key]: event.target.value });

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!form.legalName.trim() || !form.displayName.trim() || !/^\S+@\S+\.\S+$/.test(form.contactEmail.trim())) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    const created = await run(() => submitApplication({
      legalName: form.legalName.trim(),
      displayName: form.displayName.trim(),
      registrationNumber: form.registrationNumber.trim() || null,
      nafdacManufacturerNumber: form.nafdacManufacturerNumber.trim() || null,
      contactEmail: form.contactEmail.trim(),
      contactPhone: form.contactPhone.trim() || null,
      evidenceUrls: [],
    }));
    if (created) navigate('/manufacturer/pending', { state: { application: created } });
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-8 sm:px-6 sm:py-12">
      <h1 tabIndex={-1} className="text-3xl font-semibold tracking-tight">Apply as a manufacturer</h1>
      <p className="mt-2 leading-relaxed text-muted">We review each company before it can issue codes. Approval by CounterfeitIQ is not regulatory approval.</p>
      <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
        {error !== null && <RequestProblem error={error} />}
        {invalid && <StatusMessage tone="warn" title="Some details are missing" role="alert">Enter the legal name, trading name and a valid contact email.</StatusMessage>}
        <Input label="Legal company name" value={form.legalName} onChange={set('legalName')} />
        <Input label="Trading name" hint="Shown to the public on product pages." value={form.displayName} onChange={set('displayName')} />
        <Input label="Company registration number (optional)" value={form.registrationNumber} onChange={set('registrationNumber')} />
        <Input label="NAFDAC manufacturer number (optional)" value={form.nafdacManufacturerNumber} onChange={set('nafdacManufacturerNumber')} />
        <Input label="Contact email" type="email" value={form.contactEmail} onChange={set('contactEmail')} />
        <Input label="Contact phone (optional)" type="tel" value={form.contactPhone} onChange={set('contactPhone')} />
        <Button type="submit" disabled={busy} className="w-full">{busy ? 'Submitting' : 'Submit application'}</Button>
      </form>
      <p className="mt-6 text-sm text-muted">Already approved? <Link to="/manufacturer/login" className="rounded-sm text-ink underline underline-offset-4">Sign in</Link>.</p>
    </div>
  );
}

export function PendingPage() {
  useDocumentTitle('Application status');
  const application = (useLocation().state as { application?: ManufacturerApplication } | null)?.application;
  return (
    <div className="mx-auto max-w-xl px-4 py-8 sm:px-6 sm:py-12">
      <h1 tabIndex={-1} className="text-3xl font-semibold tracking-tight">Application status</h1>
      <div className="mt-6">
        {application ? (
          <StatusMessage tone="accent" title="Application received" role="status">
            <span className="font-medium">{application.displayName}</span> is waiting for review. Current status: <StatusBadge status={application.status} />
          </StatusMessage>
        ) : (
          <NotConnected endpoint="GET /api/manufacturer/applications/mine" what="We cannot look up an earlier application yet." />
        )}
      </div>
    </div>
  );
}

// ----- Dashboard -----

export function DashboardPage() {
  const products = useResource(listProducts);
  const batches = useResource(listBatches);
  const events = useResource(listManufacturerEvents);
  const stat = (label: string, value: number | undefined, loading: boolean, failed: boolean, to: string) => (
    <Link to={to} className="rounded-lg border border-line bg-surface p-4 hover:border-ink/30">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{loading ? '…' : failed ? 'Not available' : value}</p>
    </Link>
  );
  return (
    <PortalPage title="Dashboard" description="A summary of your catalogue and recent code checks.">
      <div className="grid gap-3 sm:grid-cols-3">
        {stat('Products', products.data?.items.length, products.loading, products.error !== undefined, '/manufacturer/products')}
        {stat('Batches', batches.data?.items.length, batches.loading, batches.error !== undefined, '/manufacturer/batches')}
        {stat('Recent checks', events.data?.items.length, events.loading, events.error !== undefined, '/manufacturer/verification-activity')}
      </div>
      <h2 className="mt-8 text-lg font-semibold tracking-tight">Recent checks</h2>
      <div className="mt-3">
        {events.loading && <LoadingRows />}
        {events.error !== undefined && <RequestProblem error={events.error} onRetry={events.reload} />}
        {events.data && (events.data.items.length
          ? <DataTable label="Recent checks" rows={events.data.items.slice(0, 5)} columns={eventColumns} rowKey={(row) => row.id} />
          : <EmptyState title="No checks yet">Checks appear here when people enter your codes.</EmptyState>)}
      </div>
    </PortalPage>
  );
}

// ----- Products -----

const productColumns: Column<Product>[] = [
  { header: 'Product', cell: (row) => <TableLink to={`/manufacturer/products/${row.id}`}>{row.name}</TableLink> },
  { header: 'Strength', cell: (row) => row.strength ?? '' },
  { header: 'NAFDAC number', cell: (row) => row.nafdacNumber ?? '' },
  { header: 'Status', cell: (row) => <StatusBadge status={row.status} /> },
];

export function ProductsPage() {
  const { data, error, loading, reload } = useResource(listProducts);
  return (
    <PortalPage
      title="Products"
      description="Your product claims. Adding one here does not assert regulatory approval."
      actions={<ButtonLink to="/manufacturer/products/new"><Plus aria-hidden="true" className="size-4" />Add product</ButtonLink>}
    >
      {loading && <LoadingRows />}
      {error !== undefined && <RequestProblem error={error} onRetry={reload} />}
      {data && (data.items.length
        ? <DataTable label="Products" rows={data.items} columns={productColumns} rowKey={(row) => row.id} />
        : <EmptyState title="No products yet">Add your first product to start creating batches.</EmptyState>)}
    </PortalPage>
  );
}

export function NewProductPage() {
  const navigate = useNavigate();
  const { busy, error, run } = useSubmit();
  const [form, setForm] = useState({ name: '', brand: '', description: '', dosageForm: '', strength: '', ingredients: '', nafdacNumber: '' });
  const [nameError, setNameError] = useState<string | null>(null);
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm({ ...form, [key]: event.target.value });

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!form.name.trim()) {
      setNameError('Enter the product name.');
      return;
    }
    setNameError(null);
    const created = await run(() => createProduct({
      name: form.name.trim(),
      brand: form.brand.trim() || null,
      description: form.description.trim() || null,
      dosageForm: form.dosageForm.trim() || null,
      strength: form.strength.trim() || null,
      activeIngredients: form.ingredients.split(',').map((item) => item.trim()).filter(Boolean),
      nafdacNumber: form.nafdacNumber.trim() || null,
    }));
    if (created) navigate('/manufacturer/products');
  }

  return (
    <PortalPage title="Add product">
      <form onSubmit={handleSubmit} noValidate className="max-w-xl space-y-4">
        {error !== null && <RequestProblem error={error} />}
        <Input label="Product name" value={form.name} error={nameError} onChange={set('name')} />
        <Input label="Brand (optional)" value={form.brand} onChange={set('brand')} />
        <Input label="Strength (optional)" value={form.strength} onChange={set('strength')} />
        <Input label="Dosage form (optional)" value={form.dosageForm} onChange={set('dosageForm')} />
        <Input label="Active ingredients (optional)" hint="Separate with commas." value={form.ingredients} onChange={set('ingredients')} />
        <Input label="NAFDAC number (optional)" value={form.nafdacNumber} onChange={set('nafdacNumber')} />
        <Input label="Description (optional)" value={form.description} onChange={set('description')} />
        <Button type="submit" disabled={busy}>{busy ? 'Saving' : 'Save product'}</Button>
      </form>
    </PortalPage>
  );
}

export function ProductDetailPage() {
  const id = useParams().id;
  const { data, error, loading, reload } = useResource(listProducts);
  const product = data?.items.find((item) => item.id === id);
  return (
    <PortalPage title={product?.name ?? 'Product'}>
      {loading && <LoadingRows />}
      {error !== undefined && <RequestProblem error={error} onRetry={reload} />}
      {data && !product && <EmptyState title="Product not found">It may belong to another company, or it may have been removed.</EmptyState>}
      {product && (
        <dl className="grid gap-3 rounded-lg border border-line bg-surface p-4 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-muted">Status</dt><dd className="mt-0.5"><StatusBadge status={product.status} /></dd></div>
          {[['Brand', product.brand], ['Strength', product.strength], ['Form', product.dosageForm], ['NAFDAC number', product.nafdacNumber], ['Active ingredients', product.activeIngredients.join(', ')], ['Description', product.description]]
            .filter(([, value]) => value)
            .map(([label, value]) => <div key={label}><dt className="text-xs text-muted">{label}</dt><dd className="mt-0.5 break-words font-medium">{value}</dd></div>)}
        </dl>
      )}
      <div className="mt-4"><NotConnected endpoint="PATCH /api/manufacturer/products/{id}" what="Editing a product is not available yet." /></div>
    </PortalPage>
  );
}

// ----- Batches -----

const batchColumns: Column<Batch>[] = [
  { header: 'Batch', cell: (row) => <TableLink to={`/manufacturer/batches/${row.id}`}>{row.batchNumber}</TableLink> },
  { header: 'Expires', cell: (row) => formatDate(row.expiryDate) ?? '' },
  { header: 'Status', cell: (row) => <StatusBadge status={row.status} /> },
];

export function BatchesPage() {
  const { data, error, loading, reload } = useResource(listBatches);
  return (
    <PortalPage title="Batches" actions={<ButtonLink to="/manufacturer/batches/new"><Plus aria-hidden="true" className="size-4" />Add batch</ButtonLink>}>
      {loading && <LoadingRows />}
      {error !== undefined && <RequestProblem error={error} onRetry={reload} />}
      {data && (data.items.length
        ? <DataTable label="Batches" rows={data.items} columns={batchColumns} rowKey={(row) => row.id} />
        : <EmptyState title="No batches yet">Add a batch to request codes for it.</EmptyState>)}
    </PortalPage>
  );
}

export function NewBatchPage() {
  const navigate = useNavigate();
  const products = useResource(listProducts);
  const { busy, error, run } = useSubmit();
  const [form, setForm] = useState({ productId: '', batchNumber: '', manufacturingDate: '', expiryDate: '' });
  const [problem, setProblem] = useState<string | null>(null);
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm({ ...form, [key]: event.target.value });

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!form.productId || !form.batchNumber.trim()) {
      setProblem('Choose a product and enter the batch number.');
      return;
    }
    if (form.manufacturingDate && form.expiryDate && form.expiryDate <= form.manufacturingDate) {
      setProblem('The expiry date must be after the manufacturing date.');
      return;
    }
    setProblem(null);
    const created = await run(() => createBatch({
      productId: form.productId,
      batchNumber: form.batchNumber.trim(),
      manufacturingDate: form.manufacturingDate || null,
      expiryDate: form.expiryDate || null,
    }));
    if (created) navigate(isSampleMode() ? '/manufacturer/batches' : '/manufacturer/code-allocations', { state: { createdBatch: created } });
  }

  return (
    <PortalPage title="Add batch">
      <form onSubmit={handleSubmit} noValidate className="max-w-xl space-y-4">
        {products.error !== undefined && <RequestProblem error={products.error} onRetry={products.reload} />}
        {error !== null && <RequestProblem error={error} />}
        {problem && <StatusMessage tone="warn" title="Check the details" role="alert">{problem}</StatusMessage>}
        <Select label="Product" value={form.productId} onChange={set('productId')}>
          <option value="">Choose a product</option>
          {products.data?.items.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
        </Select>
        <Input label="Batch number" value={form.batchNumber} onChange={set('batchNumber')} />
        <Input label="Manufacturing date (optional)" type="date" value={form.manufacturingDate} onChange={set('manufacturingDate')} />
        <Input label="Expiry date (optional)" type="date" value={form.expiryDate} onChange={set('expiryDate')} />
        <Button type="submit" disabled={busy}>{busy ? 'Saving' : 'Save batch'}</Button>
      </form>
    </PortalPage>
  );
}

export function BatchDetailPage() {
  const id = useParams().id;
  const { data, error, loading, reload } = useResource(listBatches);
  const batch = data?.items.find((item) => item.id === id);
  return (
    <PortalPage title={batch ? `Batch ${batch.batchNumber}` : 'Batch'}>
      {loading && <LoadingRows />}
      {error !== undefined && <RequestProblem error={error} onRetry={reload} />}
      {data && !batch && <EmptyState title="Batch not found" />}
      {batch && (
        <dl className="grid gap-3 rounded-lg border border-line bg-surface p-4 text-sm sm:grid-cols-3">
          <div><dt className="text-xs text-muted">Status</dt><dd className="mt-0.5"><StatusBadge status={batch.status} /></dd></div>
          <div><dt className="text-xs text-muted">Manufactured</dt><dd className="mt-0.5 font-medium">{formatDate(batch.manufacturingDate) ?? 'Not set'}</dd></div>
          <div><dt className="text-xs text-muted">Expires</dt><dd className="mt-0.5 font-medium">{formatDate(batch.expiryDate) ?? 'Not set'}</dd></div>
        </dl>
      )}
    </PortalPage>
  );
}

// ----- Code allocations -----

export function AllocationsPage() {
  const { data, error, loading, reload } = useResource(listAllocations);
  const batches = useResource(listBatches);
  const { busy, error: submitError, run } = useSubmit();
  const createdBatch = (useLocation().state as { createdBatch?: Batch } | null)?.createdBatch;
  const [batchId, setBatchId] = useState(createdBatch?.id ?? '');
  const [quantity, setQuantity] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [created, setCreated] = useState<CodeAllocation | null>(null);
  const [activating, setActivating] = useState<CodeAllocation | null>(null);
  const [count, setCount] = useState('');
  const [labelsFor, setLabelsFor] = useState<CodeAllocation | null>(null);

  async function handleRequest(event: FormEvent) {
    event.preventDefault();
    const amount = Number(quantity);
    if (!batchId || !Number.isInteger(amount) || amount < 1) {
      setProblem('Choose a batch and enter a whole number of codes.');
      return;
    }
    setProblem(null);
    const allocation = await run(() => createAllocation({ batchId, quantity: amount }));
    if (allocation) {
      setCreated(allocation);
      setQuantity('');
      reload();
    }
  }

  async function handleActivate() {
    if (!activating) return;
    const done = await run(() => activateAllocation(activating.id, { reconciliationCount: Number(count), confirmation: 'LABELS_RECONCILED' }));
    if (done) {
      setCreated(null);
      setActivating(null);
      setCount('');
      reload();
    }
  }

  const columns: Column<CodeAllocation>[] = [
    { header: 'Allocation', cell: (row) => row.id },
    { header: 'Quantity', cell: (row) => row.quantity.toLocaleString() },
    { header: 'Activated', cell: (row) => row.activatedCount.toLocaleString() },
    { header: 'Status', cell: (row) => <StatusBadge status={row.status} /> },
    {
      header: 'Actions',
      cell: (row) => (
        <div className="flex flex-wrap gap-3">
          {row.status === 'GENERATED' && <button type="button" className="rounded-sm font-medium underline underline-offset-4" onClick={() => setActivating(row)}>Activate</button>}
          {isSampleMode() && <button type="button" className="rounded-sm font-medium underline underline-offset-4" onClick={() => setLabelsFor(row)}>Demo labels</button>}
        </div>
      ),
    },
  ];

  const rows = data?.items ?? (created ? [created] : []);

  return (
    <PortalPage title="Code allocations" description="Request codes for a batch. Activate them only after the printed labels have been reconciled.">
      <form onSubmit={handleRequest} noValidate className="no-print grid gap-4 rounded-lg border border-line bg-surface p-4 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
        {batches.data ? (
          <Select label="Batch" value={batchId} onChange={(event) => setBatchId(event.target.value)}>
            <option value="">Choose a batch</option>
            {batches.data.items.map((batch) => <option key={batch.id} value={batch.id}>{batch.batchNumber}</option>)}
          </Select>
        ) : (
          <Input label="Batch ID" hint={createdBatch ? `Your new batch ${createdBatch.batchNumber}.` : 'Batches cannot be listed yet.'} value={batchId} onChange={(event) => setBatchId(event.target.value)} />
        )}
        <Input label="Quantity" inputMode="numeric" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
        <Button type="submit" disabled={busy}>{busy ? 'Requesting' : 'Request codes'}</Button>
      </form>

      <div className="no-print mt-4 space-y-3">
        {problem && <StatusMessage tone="warn" title="Check the details" role="alert">{problem}</StatusMessage>}
        {submitError !== null && <RequestProblem error={submitError} />}
        {created && <StatusMessage tone="accent" title="Codes generated" role="status">Allocation {created.id} has {created.generatedCount.toLocaleString()} codes. They are not active yet.</StatusMessage>}
      </div>

      <div className="no-print mt-6">
        {loading && <LoadingRows />}
        {error !== undefined && <RequestProblem error={error} onRetry={reload} />}
        {rows.length > 0 && <div className={error !== undefined ? 'mt-3' : ''}><DataTable label="Code allocations" rows={rows} columns={columns} rowKey={(row) => row.id} /></div>}
        {data && rows.length === 0 && <EmptyState title="No allocations yet" />}
        {!isSampleMode() && <div className="mt-3"><NotConnected endpoint="a controlled secret-export operation" what="Printing real labels is not available yet." /></div>}
      </div>

      {labelsFor && (
        <div className="mt-6">
          <Button variant="secondary" className="no-print mb-3" onClick={() => window.print()}>
            <Printer aria-hidden="true" className="size-4" />
            Print demo labels
          </Button>
          <DemoLabels allocationId={labelsFor.id} />
        </div>
      )}

      {activating && (
        <ConfirmDialog
          title="Activate these codes?"
          confirmLabel="Activate codes"
          busy={busy}
          onCancel={() => setActivating(null)}
          onConfirm={() => void handleActivate()}
        >
          <p>Activated codes can be checked by the public. Enter how many labels you reconciled for allocation {activating.id}.</p>
          <div className="mt-3"><Input label="Labels reconciled" inputMode="numeric" value={count} onChange={(event) => setCount(event.target.value)} /></div>
          {submitError !== null && <div className="mt-3"><RequestProblem error={submitError} /></div>}
        </ConfirmDialog>
      )}
    </PortalPage>
  );
}

// ----- Activity and settings -----

export function ActivityPage() {
  const { data, error, loading, reload } = useResource(listManufacturerEvents);
  const repeats = data?.items.filter((event) => event.outcome === 'PREVIOUSLY_VERIFIED').length ?? 0;
  const invalid = data?.items.filter((event) => event.outcome === 'INVALID_CODE').length ?? 0;
  return (
    <PortalPage title="Verification activity" description="Every code check on your packs. A repeat check is a signal to look into, not proof of counterfeiting.">
      {loading && <LoadingRows />}
      {error !== undefined && <RequestProblem error={error} onRetry={reload} />}
      {data && data.items.length > 0 && (
        <p className="mb-3 text-sm text-muted">In this list: {data.items.length} checks, {repeats} repeat, {invalid} not recognized.</p>
      )}
      {data && (data.items.length
        ? <DataTable label="Verification activity" rows={data.items} columns={eventColumns} rowKey={(row) => row.id} />
        : <EmptyState title="No checks yet" />)}
    </PortalPage>
  );
}

export function SettingsPage() {
  const { data, error, loading, reload } = useResource(getManufacturerProfile);
  return (
    <PortalPage title="Settings" description="Your company profile and staff.">
      {loading && <LoadingRows />}
      {error !== undefined && <RequestProblem error={error} onRetry={reload} />}
      {data && (
        <dl className="grid gap-3 rounded-lg border border-line bg-surface p-4 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-muted">Legal name</dt><dd className="mt-0.5 font-medium">{data.legalName}</dd></div>
          <div><dt className="text-xs text-muted">Trading name</dt><dd className="mt-0.5 font-medium">{data.displayName}</dd></div>
          <div><dt className="text-xs text-muted">Status</dt><dd className="mt-0.5"><StatusBadge status={data.status} /></dd></div>
        </dl>
      )}
      <div className="mt-4"><NotConnected endpoint="GET /api/manufacturer/members" what="Managing authorized staff is not available yet." /></div>
    </PortalPage>
  );
}
