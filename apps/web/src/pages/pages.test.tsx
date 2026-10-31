import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { analysis, fixture, foundFixture, foundLive, live, notExecuted, notFound, unavailable } from '../test/fixtures';

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
}

const photo = new File(['pack'], 'pack.jpg', { type: 'image/jpeg' });

function respondWith(body: unknown, status = 200) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function expectNoAxeViolations(container: HTMLElement) {
  // Colour contrast needs real layout, so it is checked in a browser separately.
  const { violations } = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
  expect(violations.map((violation) => violation.id)).toEqual([]);
}

beforeEach(() => {
  vi.stubEnv('VITE_USE_SAMPLE_DATA', 'false');
  vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test');
  window.scrollTo = vi.fn();
});

describe('home', () => {
  it('leads with the agreed copy and both actions', async () => {
    const { container } = renderAt('/');
    expect(screen.getByRole('heading', { level: 1, name: "Know what you're buying." })).toBeInTheDocument();
    expect(screen.getByText('Scan a product to examine its details and check available registration records.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Scan a product' })).toHaveAttribute('href', '/scan');
    expect(screen.getByRole('link', { name: 'Enter NAFDAC number' })).toHaveAttribute('href', '/lookup');
    expect(screen.getByText(/does not prove a physical pack is genuine/)).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });
});

describe('scanner', () => {
  const user = userEvent.setup({ applyAccept: false });

  it('does not upload until the user asks, then shows the report', async () => {
    const fetchMock = respondWith(analysis());
    const { container } = renderAt('/scan');
    await expectNoAxeViolations(container);

    await user.upload(screen.getByTestId('gallery-input'), photo);
    expect(await screen.findByAltText('The photo you selected')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Check this product' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Your report' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Registration details match')).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('rejects unsupported files without uploading', async () => {
    const fetchMock = respondWith(analysis());
    renderAt('/scan');
    await user.upload(screen.getByTestId('gallery-input'), new File(['x'], 'notes.pdf', { type: 'application/pdf' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That file type is not supported');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('releases the previous object URL when a photo is replaced', async () => {
    renderAt('/scan');
    await user.upload(screen.getByTestId('gallery-input'), photo);
    const first = (await screen.findByAltText('The photo you selected')).getAttribute('src');
    await user.upload(screen.getByTestId('gallery-input'), new File(['two'], 'two.png', { type: 'image/png' }));
    await waitFor(() => expect(screen.getByAltText('The photo you selected').getAttribute('src')).not.toBe(first));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(first);
  });

  it('keeps the photo and offers a retry after a retryable failure', async () => {
    respondWith({ error: { code: 'MODEL_TIMEOUT', message: 'x', retryable: true } }, 504);
    renderAt('/scan');
    await user.upload(screen.getByTestId('gallery-input'), photo);
    await user.click(await screen.findByRole('button', { name: 'Check this product' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Reading the photo took too long');
    expect(screen.getByAltText('The photo you selected')).toBeInTheDocument();

    respondWith(analysis());
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Your report' })).toBeInTheDocument();
  });

  it('offers no retry for an error that retrying cannot fix', async () => {
    respondWith({ error: { code: 'UNREADABLE_IMAGE', message: 'x', retryable: false } }, 422);
    renderAt('/scan');
    await user.upload(screen.getByTestId('gallery-input'), photo);
    await user.click(await screen.findByRole('button', { name: 'Check this product' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('We could not read that image');
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('shows a loading state with no percentages, and can be cancelled', async () => {
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    })));
    renderAt('/scan');
    await user.upload(screen.getByTestId('gallery-input'), photo);
    await user.click(await screen.findByRole('button', { name: 'Check this product' }));

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('Reading the packaging and checking available registration records');
    expect(document.body.textContent).not.toMatch(/\d+\s*%/);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByRole('button', { name: 'Check this product' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('falls back to the native capture input when the camera API is missing', async () => {
    vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { mediaDevices: undefined }));
    renderAt('/scan');
    const input = screen.getByTestId('capture-input');
    expect(input).toHaveAttribute('capture', 'environment');
    const click = vi.spyOn(input, 'click');
    await user.click(screen.getByRole('button', { name: 'Take a photo' }));
    expect(click).toHaveBeenCalled();
  });

  it('offers the device camera when camera permission is denied', async () => {
    const getUserMedia = vi.fn(async () => { throw new DOMException('Denied', 'NotAllowedError'); });
    vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { mediaDevices: { getUserMedia } }));
    renderAt('/scan');
    await user.click(screen.getByRole('button', { name: 'Take a photo' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('We could not open the camera');
    expect(screen.getByRole('button', { name: 'Use device camera' })).toBeInTheDocument();
  });

  it('sends a direct visit to the report page back to the scanner', async () => {
    renderAt('/report');
    expect(await screen.findByRole('heading', { level: 1, name: 'Scan a product' })).toBeInTheDocument();
  });

  it('clears the report and photo on Scan another product', async () => {
    respondWith(analysis());
    renderAt('/scan');
    await user.upload(screen.getByTestId('gallery-input'), photo);
    await user.click(await screen.findByRole('button', { name: 'Check this product' }));
    await user.click(await screen.findByRole('button', { name: 'Scan another product' }));
    expect(await screen.findByRole('button', { name: 'Take a photo' })).toBeInTheDocument();
    expect(screen.queryByAltText('The photo you selected')).not.toBeInTheDocument();
  });
});

describe('manual lookup', () => {
  const user = userEvent.setup();

  async function lookUp(number: string) {
    await user.type(screen.getByLabelText('NAFDAC number'), number);
    await user.click(screen.getByRole('button', { name: 'Look up record' }));
  }

  it('asks for a number instead of calling the API with nothing', async () => {
    const fetchMock = respondWith(foundLive);
    renderAt('/lookup');
    await user.click(screen.getByRole('button', { name: 'Look up record' }));
    expect(screen.getByLabelText('NAFDAC number')).toHaveAttribute('aria-invalid', 'true');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('says record found, not verified', async () => {
    respondWith(foundLive);
    const { container } = renderAt('/lookup');
    await lookUp('A1-123456');
    expect(await screen.findByText('Registration record found')).toBeInTheDocument();
    expect(screen.getByText(/does not verify any physical product/)).toBeInTheDocument();
    expect(screen.queryByText(/physical product verified/i)).not.toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('labels a fixture as a demonstration, not a registration record', async () => {
    respondWith(foundFixture);
    renderAt('/lookup');
    await lookUp('A1-123456');
    expect(await screen.findByText('Demonstration record found')).toBeInTheDocument();
    expect(screen.queryByText('Registration record found')).not.toBeInTheDocument();
    expect(screen.getByText('Demonstration record, not live NAFDAC data')).toBeInTheDocument();
  });

  it('distinguishes NOT_FOUND from SOURCE_UNAVAILABLE', async () => {
    respondWith(notFound);
    renderAt('/lookup');
    await lookUp('A1-000000');
    expect(await screen.findByText('No registration record found')).toBeInTheDocument();
    expect(screen.getByText(/does not prove a product is fake/)).toBeInTheDocument();

    respondWith(unavailable);
    await user.click(screen.getByRole('button', { name: 'Look up record' }));
    expect(await screen.findByText('Registration records could not be checked')).toBeInTheDocument();
    expect(screen.queryByText('No registration record found')).not.toBeInTheDocument();
    expect(screen.getByText(/don't know whether A1-000000 is registered/)).toBeInTheDocument();
  });

  it.each([
    ['LIVE_OFFICIAL', { ...live, authoritative: false }, /because the official NAFDAC source could not be reached/],
    ['DEMO_FIXTURE', { ...fixture }, /because no matching demonstration record is available and no live lookup was performed/],
    ['NOT_EXECUTED', notExecuted, /because no registration source was checked/],
  ] as const)('words an unavailable lookup by what actually ran (%s)', async (_mode, provenance, text) => {
    respondWith({ status: 'SOURCE_UNAVAILABLE', record: null, provenance });
    renderAt('/lookup');
    await lookUp('A1-123456');
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(screen.queryByText('Demonstration record found')).not.toBeInTheDocument();
  });

  it('offers a retry after a request failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network'); }));
    renderAt('/lookup');
    await lookUp('A1-123456');
    expect(await screen.findByRole('alert')).toHaveTextContent('The service is unavailable');
    respondWith(foundLive);
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Registration record found')).toBeInTheDocument();
  });
});
