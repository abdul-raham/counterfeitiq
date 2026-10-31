import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { scanOnce } from '../lib/v3/client';
import type { ProductReport, Provenance } from '../lib/v3/contract';
import { cleanIdentifier, isProductReport } from '../lib/v3/validate';

const demoSource: Provenance = {
  sourceType: 'SIMULATED_ERP', sourceName: 'Simulated manufacturer ERP', retrievalStatus: 'RETRIEVED',
  retrievedAt: '2026-10-31T10:00:00.000Z', dataAsOf: null, isDemo: true, unavailableFields: [],
};

const found: ProductReport = {
  outcome: 'RESOLVED',
  identityLevel: 'PRODUCT',
  identifier: { gtin: '02000000001012', batchNumber: null, serial: null, printedExpiryDate: null },
  product: { gtin: '02000000001012', productName: 'Demozol 500 mg Tablets', brand: 'Demozol', manufacturer: 'Fictional Labs Nigeria Ltd', nafdacNumber: 'DEMO-0101', strength: '500 mg', dosageForm: 'Tablet', ingredients: ['Demozolamine'], category: 'medicine' },
  batch: null,
  pack: null,
  registrationReference: null,
  scanSignal: null,
  warnings: [],
  explanation: 'This code identifies a product, not one physical pack.',
  sources: [demoSource],
  physicalAuthenticityConfirmed: false,
  notice: 'It cannot show that a physical medicine is genuine or counterfeit.',
};

const pack: ProductReport = {
  ...found,
  identityLevel: 'PACK',
  batch: { gtin: '02000000001012', batchNumber: 'DX2041', manufacturingDate: '2026-02-01', expiryDate: '2028-01-31', status: 'ACTIVE' },
  pack: { gtin: '02000000001012', serial: 'DEMOSN0001', batchNumber: 'DX2041', status: 'ACTIVE' },
  scanSignal: { totalScans: 1, distinctDevices: 1, firstSeenAt: '2026-10-01T10:00:00.000Z', lastSeenAt: '2026-10-01T10:00:00.000Z' },
  explanation: 'This code carries a serial number for one pack.',
};

const empty = { ...found, product: null, identityLevel: 'UNRESOLVED' as const };

function serve(body: unknown, status = 200) {
  const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderAt(path: string) {
  const [pathname, search] = path.split('?');
  return render(<MemoryRouter initialEntries={[{ pathname, search: search ? `?${search}` : '', key: crypto.randomUUID() }]}><App /></MemoryRouter>);
}

const user = userEvent.setup();

beforeEach(() => {
  vi.stubEnv('VITE_USE_SAMPLE_DATA', 'false');
  vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test');
  window.scrollTo = vi.fn();
  sessionStorage.clear();
});

describe('home', () => {
  it('leads with scanning and has no retired flows', async () => {
    const { container } = renderAt('/');
    expect(screen.getByRole('link', { name: 'Scan a product' })).toHaveAttribute('href', '/scan');
    expect(container.textContent).not.toMatch(/scratch|secret code|manufacturer portal|sign in/i);
    const { violations } = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(violations.map((item) => item.id)).toEqual([]);
  });

  it.each(['/authenticate', '/verification/result', '/manufacturer/login', '/admin/login'])('no longer serves %s', (path) => {
    renderAt(path);
    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument();
  });
});

describe('scanning', () => {
  it('looks up a typed code through /api/scan, with the random device value', async () => {
    const fetchMock = serve(found);
    renderAt('/scan');
    await user.type(screen.getByLabelText(/Or type the code/), '2000000001012');
    await user.click(screen.getByRole('button', { name: 'Look up this code' }));
    expect(await screen.findByText('Demozol 500 mg Tablets')).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.example.test/api/scan?identifier=2000000001012');
    expect((init.headers as Record<string, string>)['X-Scan-Device']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('rejects an empty code', async () => {
    const fetchMock = serve(found);
    renderAt('/scan');
    await user.click(screen.getByRole('button', { name: 'Look up this code' }));
    expect(screen.getByLabelText(/Or type the code/)).toHaveAttribute('aria-invalid', 'true');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('offers other ways in when the camera API is missing', () => {
    vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { mediaDevices: undefined }));
    renderAt('/scan');
    expect(screen.queryByRole('button', { name: 'Open camera' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose a photo of the QR code' })).toBeInTheDocument();
  });

  it('explains a camera failure and keeps the fallbacks', async () => {
    const getUserMedia = vi.fn(async () => { throw new DOMException('Denied', 'NotAllowedError'); });
    vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { mediaDevices: { getUserMedia } }));
    renderAt('/scan');
    await user.click(screen.getByRole('button', { name: 'Open camera' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('We could not open the camera');
    expect(screen.getByLabelText(/Or type the code/)).toBeInTheDocument();
  });

  it('counts a QR link opened again in the same tab, but not a reload', async () => {
    const fetchMock = serve(found);
    const pageLoad = async (type: string) => {
      vi.resetModules();
      const entries = vi.spyOn(performance, 'getEntriesByType').mockReturnValue([{ type }] as never);
      const client = await import('../lib/v3/client');
      await client.scanOnce('default', 'CODE-LINK');
      entries.mockRestore();
    };
    await pageLoad('navigate');
    await pageLoad('navigate');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await pageLoad('reload');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('sends one request per navigation, even if an effect runs twice', async () => {
    const fetchMock = serve(found);
    await Promise.all([scanOnce('nav-a', 'CODE-A'), scanOnce('nav-a', 'CODE-A')]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await scanOnce('nav-b', 'CODE-A');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('product result', () => {
  it('shows product and manufacturer, and names a simulated source', async () => {
    serve(found);
    const { container } = renderAt('/product/2000000001012');
    expect(await screen.findByText('Demozol 500 mg Tablets')).toBeInTheDocument();
    expect(screen.getByText('Fictional Labs Nigeria Ltd')).toBeInTheDocument();
    expect(screen.getByText(/Source: Simulated manufacturer ERP/)).toBeInTheDocument();
    expect(screen.getByText(found.explanation)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Batch' })).not.toBeInTheDocument();
    const { violations } = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(violations.map((item) => item.id)).toEqual([]);
  });

  it('shows batch and pack details when they exist', async () => {
    serve(pack);
    renderAt('/product/x-pack');
    expect(await screen.findByRole('heading', { name: 'Batch' })).toBeInTheDocument();
    expect(screen.getByText('DX2041')).toBeInTheDocument();
    expect(screen.getByText('31 January 2028')).toBeInTheDocument();
    expect(screen.getByText('DEMOSN0001')).toBeInTheDocument();
  });

  it('does not label a real source as a demo', async () => {
    serve({ ...found, sources: [{ ...demoSource, sourceType: 'MANUFACTURER_API', sourceName: 'Example ERP', isDemo: false }] });
    renderAt('/product/x-real');
    expect(await screen.findByText(/Source: Example ERP/)).toBeInTheDocument();
    expect(screen.queryByText(/Simulated/)).not.toBeInTheDocument();
  });

  it('shows no repeat notice on a first scan', async () => {
    serve(pack);
    renderAt('/product/x-first');
    await screen.findByText('DEMOSN0001');
    expect(screen.queryByText(/scanned .* before/)).not.toBeInTheDocument();
  });

  it('never shows a repeat notice for a product-level code', async () => {
    serve({ ...found, scanSignal: { ...pack.scanSignal, totalScans: 50 } });
    renderAt('/product/x-gtin');
    await screen.findByText('Demozol 500 mg Tablets');
    expect(screen.queryByText(/scanned .* before/)).not.toBeInTheDocument();
  });

  it('shows warnings from the backend, with the serious ones as alerts', async () => {
    serve({ ...pack, warnings: [{ code: 'BATCH_RECALLED', explanation: 'This batch is recalled.' }] });
    const first = renderAt('/product/x-warn');
    expect(await screen.findByRole('alert')).toHaveTextContent('This batch is recalled.');
    first.unmount();
    serve(pack);
    renderAt('/product/x-clean');
    await screen.findByText('DEMOSN0001');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('calls a QR code fake when the manufacturer has no record of it', async () => {
    serve({ ...empty, outcome: 'NOT_FOUND' });
    const { container } = renderAt('/product/qr-none?qr=1');
    expect(await screen.findByText('This QR code is fake')).toBeInTheDocument();
    expect(screen.getByText(/Do not use this medicine/)).toBeInTheDocument();
    expect((await axe.run(container)).violations).toEqual([]);
  });

  it('calls a QR code fake for a serial or batch the manufacturer never issued', async () => {
    serve({ ...found, warnings: [{ code: 'SERIAL_NOT_FOUND', explanation: 'The source has no pack with this serial number.' }] });
    const first = renderAt('/product/qr-serial?qr=1');
    expect(await screen.findByText('This QR code is fake')).toBeInTheDocument();
    expect(screen.getByText(/claims to be Demozol 500 mg Tablets/)).toBeInTheDocument();
    first.unmount();

    serve({
      ...found,
      identifier: { ...found.identifier, batchNumber: 'NOPE' },
      warnings: [{ code: 'BATCH_DATA_UNAVAILABLE', explanation: 'Batch details could not be confirmed from the source.' }],
      sources: [demoSource, { ...demoSource, retrievalStatus: 'NOT_FOUND' }],
    });
    renderAt('/product/qr-batch?qr=1');
    expect(await screen.findByText('This QR code is fake')).toBeInTheDocument();
  });

  it('never calls a QR code fake when the source could not answer', async () => {
    serve({ ...empty, outcome: 'SOURCE_UNAVAILABLE', explanation: 'The manufacturer source could not answer.' });
    const first = renderAt('/product/qr-down?qr=1');
    expect(await screen.findByText('We could not check this code')).toBeInTheDocument();
    expect(screen.queryByText('This QR code is fake')).not.toBeInTheDocument();
    first.unmount();

    serve({
      ...found,
      identifier: { ...found.identifier, batchNumber: 'DX2041' },
      warnings: [{ code: 'BATCH_DATA_UNAVAILABLE', explanation: 'Batch details could not be confirmed from the source.' }],
      sources: [demoSource, { ...demoSource, retrievalStatus: 'UNAVAILABLE' }],
    });
    renderAt('/product/qr-batch-down?qr=1');
    expect(await screen.findByText('Demozol 500 mg Tablets')).toBeInTheDocument();
    expect(screen.queryByText('This QR code is fake')).not.toBeInTheDocument();
  });

  it('never calls a typed code fake', async () => {
    serve({ ...found, warnings: [{ code: 'SERIAL_NOT_FOUND', explanation: 'The source has no pack with this serial number.' }] });
    renderAt('/product/typed-serial');
    expect(await screen.findByText('Demozol 500 mg Tablets')).toBeInTheDocument();
    expect(screen.queryByText('This QR code is fake')).not.toBeInTheDocument();
  });

  it('lists every demo code with an image and a scanned-QR link', () => {
    renderAt('/demo');
    expect(screen.getAllByRole('img')).toHaveLength(11);
    expect(screen.getByRole('link', { name: 'Open result: Fake pack' })).toHaveAttribute('href', '/product/(01)02000000001012(21)FAKESN0001?qr=1');
  });

  it('separates no record, an unavailable source and an unreadable code', async () => {
    serve({ ...empty, outcome: 'NOT_FOUND' });
    const first = renderAt('/product/x-none');
    expect(await screen.findByText('No record found')).toBeInTheDocument();
    expect(screen.getByText(/does not prove the product is fake/)).toBeInTheDocument();
    first.unmount();

    serve({ ...empty, outcome: 'SOURCE_UNAVAILABLE', explanation: 'The manufacturer source could not answer. This is not evidence of counterfeiting.' });
    const second = renderAt('/product/x-down');
    expect(await screen.findByText('We could not check this code')).toBeInTheDocument();
    expect(screen.queryByText('No record found')).not.toBeInTheDocument();
    second.unmount();

    serve({ ...empty, outcome: 'INVALID_IDENTIFIER', sources: [] });
    renderAt('/product/x-bad');
    expect(await screen.findByText('That is not a readable product code')).toBeInTheDocument();
  });

  it('shows an error and retries when the backend fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network'); }));
    renderAt('/product/x-fail');
    expect(await screen.findByRole('alert')).toHaveTextContent('The service is unavailable');
    serve(found);
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Demozol 500 mg Tablets')).toBeInTheDocument();
  });

  it('refuses a reply that claims authenticity', async () => {
    serve({ ...found, physicalAuthenticityConfirmed: true });
    renderAt('/product/x-claim');
    expect(await screen.findByText('We received a result we could not trust')).toBeInTheDocument();
    expect(screen.queryByText('Demozol 500 mg Tablets')).not.toBeInTheDocument();
  });
});

describe('repeat scans', () => {
  const repeat = { ...pack, scanSignal: { ...pack.scanSignal, totalScans: 3, distinctDevices: 2 } };

  it('says how often, without calling the product fake', async () => {
    serve(repeat);
    const { container } = renderAt('/product/x-repeat');
    expect(await screen.findByText('This pack code has been scanned 2 times before')).toBeInTheDocument();
    expect(screen.getByText(/does not mean the product is fake/)).toBeInTheDocument();
    expect(screen.getByText('Is this pack still sealed?')).toBeInTheDocument();
    const { violations } = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(violations.map((item) => item.id)).toEqual([]);
  });

  it('advises a pharmacist for a sealed pack, without a verdict', async () => {
    serve(repeat);
    const { container } = renderAt('/product/x-sealed');
    await user.click(await screen.findByRole('button', { name: "Yes, it's sealed" }));
    expect(screen.getByText('Have this pack checked before using it')).toBeInTheDocument();
    expect(screen.getByText(/may have been copied/)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/this is (a )?(fake|counterfeit)/i);
  });

  it('points to the seller for an opened pack', async () => {
    serve(repeat);
    renderAt('/product/x-opened');
    await user.click(await screen.findByRole('button', { name: "No, it's been opened" }));
    expect(screen.getByText('Ask the seller about this pack')).toBeInTheDocument();
  });
});

describe('helpers', () => {
  it.each([
    ['2000000001012', '2000000001012'],
    ['  2000000001012 ', '2000000001012'],
    ['(01)02000000001012(21)ABC', '(01)02000000001012(21)ABC'],
    ['\u001d0102000000001012\u001d21ABC', '0102000000001012\u001d21ABC'],
    ['https://id.gs1.org/01/02000000001012', 'https://id.gs1.org/01/02000000001012'],
    ['https://counterfeitiq.vercel.app/product/2000000001012', '2000000001012'],
    ['https://counterfeitiq.vercel.app/product/(01)02000000001012(21)DEMOSN0001', '(01)02000000001012(21)DEMOSN0001'],
    ['https://counterfeitiq.vercel.app/product/%2801%2902000000001012%2821%29DEMOSN0001', '(01)02000000001012(21)DEMOSN0001'],
    ['https://evil.example/product/2000000001012', 'https://evil.example/product/2000000001012'],
    ['javascript:alert(1)', null],
    ['data:text/html,hi', null],
    ['abc', null],
    ['a\u0000bcd', null],
    ['x'.repeat(300), null],
  ])('cleans %s', (input, expected) => {
    expect(cleanIdentifier(input)).toBe(expected);
  });

  it('refuses a resolved report with no product, or with no sources', () => {
    expect(isProductReport(found)).toBe(true);
    expect(isProductReport({ ...found, product: null })).toBe(false);
    expect(isProductReport({ ...found, sources: [] })).toBe(false);
    expect(isProductReport({ ...found, outcome: 'VERIFIED' })).toBe(false);
  });
});

describe('report a concern', () => {
  it('sends nothing, and points people to those who can act', () => {
    const fetchMock = serve({});
    renderAt('/report?code=2000000001012');
    expect(screen.getByText('2000000001012')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /NAFDAC's website/ })).toHaveAttribute('href', 'https://nafdac.gov.ng/');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('demo codes', () => {
  it('are labelled fictional', async () => {
    const fetchMock = serve(found);
    renderAt('/demo');
    expect(screen.getByText(/Every company and product here is fictional/)).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Open result: Product code' }));
    await screen.findByText('Demozol 500 mg Tablets');
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('identifier=2000000001012');
  });
});
