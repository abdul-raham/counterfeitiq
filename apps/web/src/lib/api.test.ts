import { describe, expect, it, vi } from 'vitest';
import { analysis, foundLive, live } from '../test/fixtures';
import { analyzeImage, lookupReference } from './api';
import { RequestError } from './errors';
import { isAnalysisResponse, isReferenceLookupResult } from './validate';

const image = new File(['x'], 'pack.jpg', { type: 'image/jpeg' });

function respondWith(body: unknown, status = 200) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function useApi() {
  vi.stubEnv('VITE_USE_SAMPLE_DATA', 'false');
  vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test/');
}

describe('api client', () => {
  it('posts the image as multipart field "image"', async () => {
    useApi();
    const fetchMock = respondWith(analysis());
    await analyzeImage(image);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.example.test/api/analyze');
    expect((init.body as FormData).get('image')).toBeInstanceOf(File);
  });

  it('URL-encodes NAFDAC numbers', async () => {
    useApi();
    const fetchMock = respondWith(foundLive);
    await lookupReference('A1/12 34');
    expect(fetchMock.mock.calls[0]?.[0 as never]).toBe('https://api.example.test/api/reference/A1%2F12%2034');
  });

  it('surfaces the contract error code and retryable flag', async () => {
    useApi();
    respondWith({ error: { code: 'UNREADABLE_IMAGE', message: 'x', retryable: false } }, 422);
    await expect(analyzeImage(image)).rejects.toMatchObject({ code: 'UNREADABLE_IMAGE', retryable: false });
  });

  it('never fakes a result when no API is configured', async () => {
    vi.stubEnv('VITE_USE_SAMPLE_DATA', 'false');
    vi.stubEnv('VITE_API_BASE_URL', '');
    await expect(analyzeImage(image)).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
  });

  it('rejects a malformed success body', async () => {
    useApi();
    respondWith({ extracted: {} });
    await expect(analyzeImage(image)).rejects.toMatchObject({ code: 'BAD_RESPONSE' });
  });

  it('reports a network failure while offline as OFFLINE', async () => {
    useApi();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network'); }));
    const onLine = vi.spyOn(navigator, 'onLine', 'get');
    onLine.mockReturnValueOnce(true).mockReturnValue(false);
    await expect(analyzeImage(image)).rejects.toMatchObject({ code: 'OFFLINE', retryable: true });
    onLine.mockRestore();
  });

  it('turns a hung request into REQUEST_TIMEOUT', async () => {
    useApi();
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    })));
    const pending = analyzeImage(image).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(60_000);
    const error = await pending;
    vi.useRealTimers();
    expect(error).toBeInstanceOf(RequestError);
    expect(error).toMatchObject({ code: 'REQUEST_TIMEOUT' });
  });

  it('reports a user cancel as an abort, not an error', async () => {
    useApi();
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    })));
    const controller = new AbortController();
    const pending = analyzeImage(image, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('response guards', () => {
  it('refuses any response that claims physical authenticity', () => {
    const claim = analysis();
    (claim.verification as { physicalAuthenticityConfirmed: boolean }).physicalAuthenticityConfirmed = true;
    expect(isAnalysisResponse(claim)).toBe(false);
  });

  it('refuses NOT_FOUND from a demo fixture', () => {
    expect(isReferenceLookupResult({
      status: 'NOT_FOUND',
      record: null,
      provenance: { source: 'DEMO_FIXTURE', mode: 'DEMO_FIXTURE', authoritative: false, requestedAt: 'x' },
    })).toBe(false);
  });

  it('refuses a fixture marked authoritative', () => {
    expect(isReferenceLookupResult({
      ...foundLive,
      provenance: { source: 'DEMO_FIXTURE', mode: 'DEMO_FIXTURE', authoritative: true, requestedAt: 'x' },
    })).toBe(false);
  });

  it('refuses a live claim for an unavailable source', () => {
    expect(isReferenceLookupResult({ status: 'SOURCE_UNAVAILABLE', record: null, provenance: live })).toBe(false);
  });

  it('refuses RECORD_NOT_FOUND without a completed NOT_FOUND lookup', () => {
    expect(isAnalysisResponse(analysis({ reference: null, verification: { status: 'RECORD_NOT_FOUND' } }))).toBe(false);
  });

  it('accepts a non-medicine result with no lookup', () => {
    expect(isAnalysisResponse(analysis({
      reference: null,
      verification: { status: 'INSUFFICIENT_EVIDENCE', categoryVerificationSupported: false },
    }))).toBe(true);
  });
});
