import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { setSession } from '../lib/v2/session';
import { cleanSecretCode, isAuthenticateResponse, isPublicProductSummary, parsePackIdentifier } from '../lib/v2/validate';
import type { AuthenticatePackResponse, AuthenticationOutcome, PublicProductSummary } from '../lib/v2/contract';

const summary: PublicProductSummary = {
  product: { id: 'p1', name: 'Example Medicine', brand: null, dosageForm: 'Tablet', strength: '500 mg', activeIngredients: ['Exampleol'] },
  manufacturer: { id: 'm1', displayName: 'Example Pharma' },
  batch: { batchNumber: 'EX1', manufacturingDate: '2025-06-01', expiryDate: '2027-06-30', status: 'ACTIVE' },
  pack: { publicIdentifier: 'PACK-0001', status: 'ACTIVE' },
  secretCodeRequired: true,
  authenticityConfirmed: false,
};

function outcome(value: AuthenticationOutcome, firstVerifiedAt: string | null = null): AuthenticatePackResponse {
  return { outcome: value, product: summary, checkedAt: '2026-10-31T10:00:00.000Z', firstVerifiedAt, message: 'x', authenticityConfirmed: false };
}

type Handler = (url: string, init: RequestInit) => { status?: number; body: unknown };

function serve(handler: Handler) {
  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    const { status = 200, body } = handler(url, init);
    return new Response(JSON.stringify(body), { status });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
}

async function expectNoAxeViolations(container: HTMLElement) {
  const { violations } = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
  expect(violations.map((violation) => violation.id)).toEqual([]);
}

const user = userEvent.setup();

beforeEach(() => {
  vi.stubEnv('VITE_USE_SAMPLE_DATA', 'false');
  vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test');
  window.scrollTo = vi.fn();
});

afterEach(() => act(() => setSession(null)));

describe('public scan', () => {
  it('shows product details without sending or consuming any code', async () => {
    const fetchMock = serve(() => ({ body: summary }));
    const { container } = renderAt('/product/PACK-0001');
    expect(await screen.findByText('Example Medicine')).toBeInTheDocument();
    expect(screen.getByText('Next, scratch the hidden panel')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.example.test/api/public/scan/PACK-0001');
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
    await expectNoAxeViolations(container);
  });

  it('goes to the product page from the manual fallback', async () => {
    serve(() => ({ body: summary }));
    renderAt('/scan');
    await user.type(screen.getByLabelText(/Or type the pack ID/), 'PACK-0001');
    await user.click(screen.getByRole('button', { name: 'Find this pack' }));
    expect(await screen.findByText('Example Medicine')).toBeInTheDocument();
  });

  it('rejects a manual entry that cannot be a pack ID', async () => {
    const fetchMock = serve(() => ({ body: summary }));
    renderAt('/scan');
    await user.type(screen.getByLabelText(/Or type the pack ID/), 'a b');
    await user.click(screen.getByRole('button', { name: 'Find this pack' }));
    expect(screen.getByLabelText(/Or type the pack ID/)).toHaveAttribute('aria-invalid', 'true');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('separates an unknown pack from an unavailable service', async () => {
    serve(() => ({ status: 404, body: { error: { code: 'INTERNAL_ERROR', message: 'x', retryable: false } } }));
    const first = renderAt('/product/PACK-0001');
    expect(await screen.findByText('We could not find this pack')).toBeInTheDocument();
    expect(screen.getByText(/does not prove it is fake/)).toBeInTheDocument();
    first.unmount();

    serve(() => ({ status: 404, body: { error: { code: 'SERVICE_UNAVAILABLE', message: 'route', retryable: false } } }));
    renderAt('/product/PACK-0002');
    expect(await screen.findByText('The service is unavailable')).toBeInTheDocument();
    expect(screen.queryByText('We could not find this pack')).not.toBeInTheDocument();
  });

  it('warns about a blocked batch before the code step', async () => {
    serve(() => ({ body: { ...summary, batch: { ...summary.batch, status: 'BLOCKED' } } }));
    renderAt('/product/PACK-0001');
    expect(await screen.findByText('This pack or batch has been blocked')).toBeInTheDocument();
  });
});

describe('code check', () => {
  async function submit(code = 'SECRET-1234') {
    await user.type(screen.getByLabelText('Secret code'), code);
    await user.click(screen.getByRole('button', { name: 'Check code' }));
  }

  it('sends the code in the body only, through its own operation', async () => {
    const fetchMock = serve(() => ({ body: outcome('FIRST_VERIFICATION') }));
    renderAt('/authenticate?pack=PACK-0001');
    await submit();
    await screen.findByText('Code recognized, first check');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.example.test/api/public/authenticate');
    expect(url).not.toContain('SECRET');
    expect(JSON.parse(init.body as string)).toEqual({ publicIdentifier: 'PACK-0001', secretCode: 'SECRET-1234' });
  });

  it('never calls a first check genuine', async () => {
    serve(() => ({ body: outcome('FIRST_VERIFICATION') }));
    const { container } = renderAt('/authenticate?pack=PACK-0001');
    await submit();
    await screen.findByText('Code recognized, first check');
    expect(screen.getByText(/does not by itself prove/)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/genuine product|verified genuine|100%|authentic/i);
    await expectNoAxeViolations(container);
  });

  it.each<[AuthenticationOutcome, string]>([
    ['PREVIOUSLY_VERIFIED', 'This code has been checked before'],
    ['INVALID_CODE', 'Code not recognized'],
    ['PRODUCT_MISMATCH', 'This code does not belong to this product'],
    ['CODE_REVOKED', 'This code has been revoked'],
    ['BATCH_BLOCKED', 'This batch has been blocked'],
    ['CODE_NOT_ACTIVE', 'This code is not active yet'],
    ['VERIFICATION_UNAVAILABLE', 'Verification is unavailable'],
  ])('shows the right result for %s', async (value, title) => {
    serve(() => ({ body: outcome(value, value === 'PREVIOUSLY_VERIFIED' ? '2026-09-14T15:20:00.000Z' : null) }));
    const { container } = renderAt('/authenticate?pack=PACK-0001');
    await submit();
    expect(await screen.findByText(title)).toBeInTheDocument();
    if (value === 'PREVIOUSLY_VERIFIED') {
      expect(screen.getByText(/First checked:/)).toBeInTheDocument();
      expect(screen.getByText(/does not prove the product is fake/)).toBeInTheDocument();
    }
    expect(container.textContent).not.toMatch(/genuine product/i);
  });

  it('sends a code only once when tapped twice', async () => {
    let resolve: (value: Response) => void = () => {};
    const fetchMock = vi.fn(() => new Promise<Response>((done) => { resolve = done; }));
    vi.stubGlobal('fetch', fetchMock);
    renderAt('/authenticate?pack=PACK-0001');
    await user.type(screen.getByLabelText('Secret code'), 'SECRET-1234');
    const button = screen.getByRole('button', { name: 'Check code' });
    await user.dblClick(button);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Checking the code' })).toBeDisabled();
    await act(async () => resolve(new Response(JSON.stringify(outcome('FIRST_VERIFICATION')))));
  });

  it('explains a repeat result after a failed attempt', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new TypeError('network');
      return new Response(JSON.stringify(outcome('PREVIOUSLY_VERIFIED', '2026-10-31T09:59:00.000Z')));
    }));
    renderAt('/authenticate?pack=PACK-0001');
    await submit();
    expect(await screen.findByText(/may already have been received/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Check code' }));
    expect(await screen.findByText('This may be your earlier attempt')).toBeInTheDocument();
  });

  it('asks for a code rather than sending nothing', async () => {
    const fetchMock = serve(() => ({ body: outcome('INVALID_CODE') }));
    renderAt('/authenticate?pack=PACK-0001');
    await user.click(screen.getByRole('button', { name: 'Check code' }));
    expect(screen.getByLabelText('Secret code')).toHaveAttribute('aria-invalid', 'true');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends a direct visit to the result page back to the scanner', async () => {
    renderAt('/verification/result');
    expect(await screen.findByRole('heading', { level: 1, name: 'Scan a product' })).toBeInTheDocument();
  });

  it('refuses a reply that claims authenticity', async () => {
    serve(() => ({ body: { ...outcome('FIRST_VERIFICATION'), authenticityConfirmed: true } }));
    renderAt('/authenticate?pack=PACK-0001');
    await submit();
    expect(await screen.findByText('We received a result we could not trust')).toBeInTheDocument();
    expect(screen.queryByText('Code recognized, first check')).not.toBeInTheDocument();
  });
});

describe('helpers', () => {
  it.each([
    ['PACK-0001', 'PACK-0001'],
    ['https://counterfeitiq.vercel.app/product/PACK-0001', 'PACK-0001'],
    ['https://example.test/p/PACK-0001', 'PACK-0001'],
    ['https://example.test/?id=PACK-0001', 'PACK-0001'],
    ['https://evil.example/phish', null],
    ['javascript:alert(1)', null],
    ['../../admin', null],
    ['ab', null],
  ])('reads a pack ID from %s', (input, expected) => {
    expect(parsePackIdentifier(input)).toBe(expected);
  });

  it('ignores spaces in a secret code and rejects empty ones', () => {
    expect(cleanSecretCode(' AB12 CD34 ')).toBe('AB12CD34');
    expect(cleanSecretCode('  ')).toBeNull();
  });

  it('rejects replies that claim authenticity', () => {
    expect(isPublicProductSummary({ ...summary, authenticityConfirmed: true })).toBe(false);
    expect(isAuthenticateResponse({ ...outcome('FIRST_VERIFICATION'), authenticityConfirmed: true })).toBe(false);
    expect(isAuthenticateResponse({ ...outcome('FIRST_VERIFICATION'), outcome: 'GENUINE' })).toBe(false);
  });
});

describe('report a concern', () => {
  it('creates an investigation and shows its reference', async () => {
    const fetchMock = serve(() => ({ status: 201, body: { id: 'inv-1' } }));
    renderAt('/report?pack=PACK-0001&outcome=PREVIOUSLY_VERIFIED');
    await user.type(screen.getByLabelText('What concerned you?'), 'The seal was already broken.');
    await user.click(screen.getByRole('button', { name: 'Send report' }));
    expect(await screen.findByText('inv-1')).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/api/public/investigations');
    expect(JSON.parse(init.body as string)).toMatchObject({ publicIdentifier: 'PACK-0001', authenticationOutcome: 'PREVIOUSLY_VERIFIED' });
  });
});

describe('portal access', () => {
  it('sends a signed-out visitor to sign in', async () => {
    renderAt('/manufacturer/dashboard');
    expect(await screen.findByRole('heading', { level: 1, name: 'Manufacturer sign in' })).toBeInTheDocument();
  });

  it('says sign-in is not connected instead of faking it', async () => {
    const { container } = renderAt('/admin/login');
    expect(await screen.findByText('Not connected yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sign in/i })).not.toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('blocks a manufacturer from the admin portal', async () => {
    act(() => setSession({ token: 't', role: 'MANUFACTURER_ADMIN', displayName: 'M', manufacturerId: 'm1' }));
    const fetchMock = serve(() => ({ body: { items: [], nextCursor: null } }));
    renderAt('/admin/applications');
    expect(await screen.findByText('You do not have access to this area')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('blocks an administrator from the manufacturer portal', async () => {
    act(() => setSession({ token: 't', role: 'PLATFORM_ADMIN', displayName: 'A', manufacturerId: null }));
    renderAt('/manufacturer/products');
    expect(await screen.findByText('You do not have access to this area')).toBeInTheDocument();
  });

  it('shows a server refusal even when the interface allowed the page', async () => {
    act(() => setSession({ token: 't', role: 'MANUFACTURER_VIEWER', displayName: 'M', manufacturerId: 'm1' }));
    serve(() => ({ status: 403, body: {} }));
    renderAt('/manufacturer/products');
    expect(await screen.findByText('You do not have access')).toBeInTheDocument();
  });

  it('lets someone sign out on any screen size', async () => {
    act(() => setSession({ token: 't', role: 'MANUFACTURER_ADMIN', displayName: 'M', manufacturerId: 'm1' }));
    serve(() => ({ body: { items: [], nextCursor: null } }));
    renderAt('/manufacturer/products');
    const signOut = await screen.findByRole('button', { name: 'Sign out' });
    expect(signOut.className).not.toContain('hidden');
    await user.click(signOut);
    expect(await screen.findByRole('heading', { level: 1, name: 'Manufacturer sign in' })).toBeInTheDocument();
  });

  it('sends the token with portal requests', async () => {
    act(() => setSession({ token: 'tok-1', role: 'MANUFACTURER_ADMIN', displayName: 'M', manufacturerId: 'm1' }));
    const fetchMock = serve(() => ({ body: { items: [], nextCursor: null } }));
    renderAt('/manufacturer/products');
    await screen.findByText('No products yet');
    const init = fetchMock.mock.calls[0]?.[1 as never] as unknown as RequestInit;
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer tok-1');
  });
});

describe('manufacturer flows', () => {
  beforeEach(() => act(() => setSession({ token: 't', role: 'MANUFACTURER_ADMIN', displayName: 'Example Pharma', manufacturerId: 'm1' })));

  it('submits an application', async () => {
    act(() => setSession(null));
    const fetchMock = serve(() => ({ status: 201, body: { id: 'a1', displayName: 'New Co', status: 'SUBMITTED' } }));
    const { container } = renderAt('/manufacturer/apply');
    await expectNoAxeViolations(container);
    await user.type(screen.getByLabelText('Legal company name'), 'New Co Ltd');
    await user.type(screen.getByLabelText(/Trading name/), 'New Co');
    await user.type(screen.getByLabelText('Contact email'), 'a@new.example');
    await user.click(screen.getByRole('button', { name: 'Submit application' }));
    expect(await screen.findByText('Application received')).toBeInTheDocument();
    const init = fetchMock.mock.calls[0]?.[1 as never] as unknown as RequestInit;
    expect(JSON.parse(init.body as string)).toMatchObject({ legalName: 'New Co Ltd', registrationNumber: null, evidenceUrls: [] });
  });

  it('does not submit an incomplete application', async () => {
    act(() => setSession(null));
    const fetchMock = serve(() => ({ body: {} }));
    renderAt('/manufacturer/apply');
    await user.click(screen.getByRole('button', { name: 'Submit application' }));
    expect(await screen.findByText('Some details are missing')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('creates a product', async () => {
    const fetchMock = serve((_url, init) => (init.method === 'POST'
      ? { status: 201, body: { id: 'p9' } }
      : { body: { items: [], nextCursor: null } }));
    renderAt('/manufacturer/products/new');
    await user.type(screen.getByLabelText('Product name'), 'New Medicine');
    await user.type(screen.getByLabelText(/Active ingredients/), 'One, Two');
    await user.click(screen.getByRole('button', { name: 'Save product' }));
    await screen.findByRole('heading', { level: 1, name: 'Products' });
    const post = fetchMock.mock.calls.find((call) => (call[1 as never] as unknown as RequestInit).method === 'POST') as unknown as [string, RequestInit];
    expect(JSON.parse(post[1].body as string)).toMatchObject({ name: 'New Medicine', activeIngredients: ['One', 'Two'], brand: null });
  });

  it('creates a batch and rejects an impossible expiry', async () => {
    const product = { id: 'p1', name: 'Example Medicine', status: 'ACTIVE' };
    const fetchMock = serve((_url, init) => (init.method === 'POST'
      ? { status: 201, body: { id: 'b1', batchNumber: 'B1' } }
      : { body: { items: [product], nextCursor: null } }));
    renderAt('/manufacturer/batches/new');
    await user.selectOptions(await screen.findByLabelText('Product'), await screen.findByRole('option', { name: 'Example Medicine' }));
    await user.type(screen.getByLabelText('Batch number'), 'B1');
    await user.type(screen.getByLabelText(/Manufacturing date/), '2026-02-01');
    await user.type(screen.getByLabelText(/Expiry date/), '2026-01-01');
    await user.click(screen.getByRole('button', { name: 'Save batch' }));
    expect(await screen.findByText(/must be after the manufacturing date/)).toBeInTheDocument();
    expect(fetchMock.mock.calls.some((call) => (call[1 as never] as unknown as RequestInit).method === 'POST')).toBe(false);

    await user.clear(screen.getByLabelText(/Expiry date/));
    await user.type(screen.getByLabelText(/Expiry date/), '2028-01-01');
    await user.click(screen.getByRole('button', { name: 'Save batch' }));
    await waitFor(() => expect(fetchMock.mock.calls.some((call) => (call[1 as never] as unknown as RequestInit).method === 'POST')).toBe(true));
  });

  it('names the missing endpoint instead of faking a list', async () => {
    renderAt('/manufacturer/batches');
    expect(await screen.findByText('Not connected yet')).toBeInTheDocument();
    expect(screen.getByText('GET /api/manufacturer/batches')).toBeInTheDocument();
  });

  it('requests codes through the contract even though they cannot be listed', async () => {
    const fetchMock = serve(() => ({ status: 201, body: { id: 'alc-9', generatedCount: 10, quantity: 10, activatedCount: 0, status: 'GENERATED' } }));
    renderAt('/manufacturer/code-allocations');
    await user.type(await screen.findByLabelText(/Batch ID/), 'b1');
    await user.type(screen.getByLabelText('Quantity'), '10');
    await user.click(screen.getByRole('button', { name: 'Request codes' }));
    expect(await screen.findByText('Codes generated')).toBeInTheDocument();
    expect(JSON.parse((fetchMock.mock.calls[0]?.[1 as never] as unknown as RequestInit).body as string)).toEqual({ batchId: 'b1', quantity: 10 });
    expect(screen.getByRole('button', { name: 'Activate' })).toBeInTheDocument();
  });
});

describe('admin flows', () => {
  const application = { id: 'app-1', displayName: 'New Co', legalName: 'New Co Ltd', contactEmail: 'a@new.example', status: 'SUBMITTED', decisionReason: null };

  beforeEach(() => act(() => setSession({ token: 't', role: 'PLATFORM_ADMIN', displayName: 'Admin', manufacturerId: null })));

  it.each<['Approve' | 'Reject', string, string]>([
    ['Approve', 'Approve company', 'APPROVE'],
    ['Reject', 'Reject company', 'REJECT'],
  ])('records a decision: %s', async (action, confirm, decision) => {
    const fetchMock = serve((_url, init) => (init.method === 'POST'
      ? { body: { ...application, status: `${decision}D` } }
      : { body: { items: [application], nextCursor: null } }));
    renderAt('/admin/applications');
    await user.click(await screen.findByRole('button', { name: `${action} New Co` }));
    await user.click(screen.getByRole('button', { name: confirm, hidden: true }));
    expect(await screen.findByText(/Enter a reason/)).toBeInTheDocument();
    await user.type(screen.getByLabelText('Reason'), 'Checked documents');
    await user.click(screen.getByRole('button', { name: confirm, hidden: true }));
    await waitFor(() => {
      const post = fetchMock.mock.calls.find((call) => (call[1 as never] as unknown as RequestInit).method === 'POST') as unknown as [string, RequestInit] | undefined;
      expect(post?.[0]).toContain('/api/admin/manufacturers/app-1/decision');
      expect(JSON.parse(post?.[1].body as string)).toEqual({ decision, reason: 'Checked documents' });
    });
  });

  it('confirms before revoking a code', async () => {
    const fetchMock = serve(() => ({ body: {} }));
    renderAt('/admin/code-allocations');
    await user.type(await screen.findByLabelText('Code ID'), 'code-1');
    await user.type(screen.getByLabelText('Reason'), 'Label leak');
    await user.click(screen.getByRole('button', { name: 'Revoke code' }));
    expect(fetchMock).not.toHaveBeenCalled();
    const buttons = screen.getAllByRole('button', { name: 'Revoke code', hidden: true });
    await user.click(buttons[buttons.length - 1] as HTMLElement);
    expect(await screen.findByText('Code revoked')).toBeInTheDocument();
    expect(String(fetchMock.mock.calls[0]?.[0 as never])).toContain('/api/admin/codes/code-1/revoke');
  });

  it.each(['/admin/manufacturers', '/admin/audit', '/admin/investigations', '/admin/verification-events'])('marks %s as not connected', async (path) => {
    renderAt(path);
    expect(await screen.findByText('Not connected yet')).toBeInTheDocument();
  });
});

describe('sample mode', () => {
  it('keeps fixtures out of normal mode', async () => {
    serve(() => ({ status: 503, body: { error: { code: 'SERVICE_UNAVAILABLE', message: 'x', retryable: true } } }));
    renderAt('/scan');
    expect(screen.queryByText(/Sample packs/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Sample mode/)).not.toBeInTheDocument();
  });

  it('labels itself and runs the whole journey', async () => {
    vi.stubEnv('VITE_USE_SAMPLE_DATA', 'true');
    renderAt('/product/CIQ-DEMO-0005');
    expect(await screen.findByText('Example Medicine')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Enter secret code' }));
    await user.type(screen.getByLabelText('Secret code'), 'DEMO-5555');
    await user.click(screen.getByRole('button', { name: 'Check code' }));
    expect(await screen.findByText('This code is not active yet')).toBeInTheDocument();
  });
});
