import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { resolveOnce } from '../lib/v3/client';
import type { ResolveResponse } from '@counterfeitiq/shared/v3';
import { cleanIdentifier, isResolveResponse } from '../lib/v3/validate';

const found: ResolveResponse = {
  identifier: '5901234123457',
  identifierType: 'GTIN',
  identityLevel: 'PRODUCT',
  product: { name: 'Examplol 500 mg Tablets', brand: 'Examplol', strength: '500 mg', dosageForm: 'Tablet', activeIngredients: ['Exampleol'], packSize: null, nafdacNumber: null, description: null },
  manufacturer: { name: 'Example Pharma Ltd', country: 'Nigeria', website: null },
  batch: null,
  pack: null,
  source: { type: 'DEMO_ERP', name: 'Simulated manufacturer ERP', status: 'FOUND', retrievedAt: '2026-10-31T10:00:00.000Z' },
  reference: null,
  scanSummary: null,
  warnings: [],
  limitations: ['This barcode identifies the product type.'],
};

const pack: ResolveResponse = {
  ...found,
  identifier: '(01)05901234123457(21)PACK1',
  identifierType: 'GS1_DATAMATRIX',
  identityLevel: 'PACK',
  batch: { batchNumber: 'EX2041', manufacturingDate: '2025-06-01', expiryDate: '2027-06-30', status: 'Released' },
  pack: { serialNumber: 'PACK1', status: 'Active' },
  limitations: [],
};

function serve(body: unknown, status = 200) {
  const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderAt(path: string, state?: unknown) {
  return render(<MemoryRouter initialEntries={[{ pathname: path.split('?')[0], search: path.split('?')[1] ? `?${path.split('?')[1]}` : '', state, key: crypto.randomUUID() }]}><App /></MemoryRouter>);
}

const sentBody = (mock: ReturnType<typeof serve>) => JSON.parse(mock.mock.calls[0]?.[1]?.body as string) as Record<string, unknown>;

const user = userEvent.setup();

beforeEach(() => {
  vi.stubEnv('VITE_USE_SAMPLE_DATA', 'false');
  vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test');
  window.scrollTo = vi.fn();
});

describe('home', () => {
  it('leads with scanning and has no retired flows', async () => {
    const { container } = renderAt('/');
    expect(screen.getByRole('link', { name: 'Scan a product' })).toHaveAttribute('href', '/scan');
    expect(container.textContent).not.toMatch(/scratch|secret code|manufacturer portal|sign in/i);
    const { violations } = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(violations.map((item) => item.id)).toEqual([]);
  });

  it.each(['/authenticate', '/verification/result', '/manufacturer/login', '/manufacturer/dashboard', '/admin/login', '/admin/dashboard'])('no longer serves %s', (path) => {
    renderAt(path);
    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument();
  });
});

describe('scanning', () => {
  it('looks up a typed code and records it as a fresh scan', async () => {
    const fetchMock = serve(found);
    renderAt('/scan');
    await user.type(screen.getByLabelText(/Or type the code/), '5901234123457');
    await user.click(screen.getByRole('button', { name: 'Look up this code' }));
    expect(await screen.findByText('Examplol 500 mg Tablets')).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.example.test/api/v3/resolve');
    expect(init.method).toBe('POST');
    expect(sentBody(fetchMock)).toMatchObject({ identifier: '5901234123457', recordScan: true });
    expect(typeof sentBody(fetchMock).anonymousSessionId).toBe('string');
  });

  it('does not count opening a saved link as a scan, or send a session ID', async () => {
    const fetchMock = serve(found);
    renderAt('/product/5901234123457');
    await screen.findByText('Examplol 500 mg Tablets');
    expect(sentBody(fetchMock)).toMatchObject({ recordScan: false, anonymousSessionId: null });
  });

  it('rejects an empty code', async () => {
    const fetchMock = serve(found);
    renderAt('/scan');
    await user.click(screen.getByRole('button', { name: 'Look up this code' }));
    expect(screen.getByLabelText(/Or type the code/)).toHaveAttribute('aria-invalid', 'true');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('offers manual entry when the camera API is missing', () => {
    vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { mediaDevices: undefined }));
    renderAt('/scan');
    expect(screen.queryByRole('button', { name: 'Open camera' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose a photo of the barcode' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Or type the code/)).toBeInTheDocument();
  });

  it('explains a camera failure and keeps the fallbacks', async () => {
    const getUserMedia = vi.fn(async () => { throw new DOMException('Denied', 'NotAllowedError'); });
    vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { mediaDevices: { getUserMedia } }));
    renderAt('/scan');
    await user.click(screen.getByRole('button', { name: 'Open camera' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('We could not open the camera');
    expect(screen.getByLabelText(/Or type the code/)).toBeInTheDocument();
  });

  it('does not count the same navigation again after a reload', async () => {
    const key = crypto.randomUUID();
    const first = serve(found);
    await resolveOnce(key, 'CODE-RELOAD', true);
    expect(sentBody(first).recordScan).toBe(true);
    // A failed attempt clears the in-flight cache, the same as a reload starting fresh.
    const second = serve(found);
    await resolveOnce(key, 'CODE-RELOAD-2', true);
    expect(sentBody(second).recordScan).toBe(false);
    expect(sentBody(second).anonymousSessionId).toBeNull();
  });

  it('sends one request per navigation, even if an effect runs twice', async () => {
    const fetchMock = serve(found);
    await Promise.all([resolveOnce('nav-1', 'CODE-1', true), resolveOnce('nav-1', 'CODE-1', true)]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await resolveOnce('nav-2', 'CODE-1', true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('product result', () => {
  it('shows product and manufacturer, and labels a demo record prominently', async () => {
    serve(found);
    const { container } = renderAt('/product/5901234123457');
    expect(await screen.findByText('Examplol 500 mg Tablets')).toBeInTheDocument();
    expect(screen.getAllByText('Example Pharma Ltd').length).toBeGreaterThan(0);
    expect(screen.getByText('Demo record: fictional company and product')).toBeInTheDocument();
    expect(screen.getByText('This barcode identifies the product type.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Batch' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'This pack' })).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/genuine product|verified|authentic/i);
    const { violations } = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(violations.map((item) => item.id)).toEqual([]);
  });

  it('shows batch and pack details when they exist', async () => {
    serve(pack);
    renderAt('/product/x-pack');
    expect(await screen.findByRole('heading', { name: 'Batch' })).toBeInTheDocument();
    expect(screen.getByText('EX2041')).toBeInTheDocument();
    expect(screen.getByText('30 June 2027')).toBeInTheDocument();
    expect(screen.getByText('PACK1')).toBeInTheDocument();
  });

  it('does not label an authorized source as a demo', async () => {
    serve({ ...found, source: { ...found.source, type: 'AUTHORIZED_ERP', name: 'Example ERP' } });
    renderAt('/product/x-auth');
    expect(await screen.findByText(/Example ERP \(manufacturer system\)/)).toBeInTheDocument();
    expect(screen.queryByText(/Demo record/)).not.toBeInTheDocument();
  });

  it('shows a repeat notice for a pack, without calling it fake', async () => {
    serve({ ...pack, scanSummary: { previousScans: 2, firstScannedAt: '2026-10-01T10:00:00.000Z', persistenceNote: 'Counts may reset.' } });
    renderAt('/product/x-repeat');
    expect(await screen.findByText('This pack code has been scanned 2 times before')).toBeInTheDocument();
    expect(screen.getByText(/does not mean the product is fake/)).toBeInTheDocument();
    expect(screen.getByText('Counts may reset.')).toBeInTheDocument();
  });

  it('shows no repeat notice on a first pack scan', async () => {
    serve({ ...pack, scanSummary: { previousScans: 0, firstScannedAt: null, persistenceNote: 'x' } });
    renderAt('/product/x-first');
    await screen.findByText('PACK1');
    expect(screen.queryByText(/scanned .* before/)).not.toBeInTheDocument();
  });

  it('never shows a repeat notice for an ordinary barcode shared by every pack', async () => {
    serve({ ...found, scanSummary: { previousScans: 50, firstScannedAt: null, persistenceNote: 'x' } });
    renderAt('/product/x-gtin');
    await screen.findByText('Examplol 500 mg Tablets');
    expect(screen.queryByText(/scanned .* before/)).not.toBeInTheDocument();
  });

  it('shows warnings from the backend, and adds none of its own', async () => {
    serve({ ...pack, warnings: [{ code: 'BATCH_RECALLED', severity: 'HIGH', message: 'This batch is recalled.' }] });
    const first = renderAt('/product/x-warn');
    expect(await screen.findByRole('alert')).toHaveTextContent('This batch is recalled.');
    first.unmount();
    serve(pack);
    renderAt('/product/x-clean');
    await screen.findByText('PACK1');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('separates a missing record from an unavailable source', async () => {
    const notFound = { ...found, identityLevel: null, product: null, manufacturer: null, limitations: [] };
    serve({ ...notFound, source: { ...found.source, status: 'NOT_FOUND' } });
    const first = renderAt('/product/x-none');
    expect(await screen.findByText('No record found')).toBeInTheDocument();
    expect(screen.getByText('Demo record: fictional company and product')).toBeInTheDocument();
    expect(screen.getByText(/does not prove the product is fake/)).toBeInTheDocument();
    first.unmount();

    serve({ ...notFound, source: { ...found.source, status: 'UNAVAILABLE' } });
    renderAt('/product/x-down');
    expect(await screen.findByText('We could not check this code')).toBeInTheDocument();
    expect(screen.queryByText('No record found')).not.toBeInTheDocument();
    expect(screen.getByText(/says nothing about the product/)).toBeInTheDocument();
  });

  it('shows an error and retries when the backend fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network'); }));
    renderAt('/product/x-fail');
    expect(await screen.findByRole('alert')).toHaveTextContent('The service is unavailable');
    serve(found);
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Examplol 500 mg Tablets')).toBeInTheDocument();
  });

  it('refuses a malformed reply', async () => {
    serve({ ...found, source: { ...found.source, type: 'OFFICIAL' } });
    renderAt('/product/x-bad');
    expect(await screen.findByText('We received a result we could not trust')).toBeInTheDocument();
    expect(screen.queryByText('Examplol 500 mg Tablets')).not.toBeInTheDocument();
  });
});

describe('helpers', () => {
  it.each([
    ['5901234123457', '5901234123457'],
    ['  5901234123457 ', '5901234123457'],
    ['(01)05901234123457(21)ABC', '(01)05901234123457(21)ABC'],
    ['0105901234123457\u001d21ABC', '0105901234123457\u001d21ABC'],
    ['https://id.gs1.org/01/05901234123457', 'https://id.gs1.org/01/05901234123457'],
    ['javascript:alert(1)', null],
    ['data:text/html,hi', null],
    ['abc', null],
    ['a\u0000bcd', null],
    ['x'.repeat(300), null],
  ])('cleans %s', (input, expected) => {
    expect(cleanIdentifier(input)).toBe(expected);
  });

  it('refuses found results with no product, and unknown sources', () => {
    expect(isResolveResponse(found)).toBe(true);
    expect(isResolveResponse({ ...found, product: null })).toBe(false);
    expect(isResolveResponse({ ...found, source: { ...found.source, status: 'VERIFIED' } })).toBe(false);
  });
});

describe('report a concern', () => {
  it('sends nothing, and points people to those who can act', async () => {
    const fetchMock = serve({});
    renderAt('/report?code=5901234123457');
    expect(screen.getByText('5901234123457')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /NAFDAC's website/ })).toHaveAttribute('href', 'https://nafdac.gov.ng/');
    await waitFor(() => expect(fetchMock).not.toHaveBeenCalled());
  });
});

describe('demo codes', () => {
  it('are labelled fictional and count as fresh scans', async () => {
    const fetchMock = serve(found);
    renderAt('/scan');
    expect(screen.getByText('These use fictional companies and products.')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Product barcode' }));
    await screen.findByText('Examplol 500 mg Tablets');
    expect(sentBody(fetchMock)).toMatchObject({ identifier: '2000000000015', recordScan: true });
  });
});
