import { afterEach, describe, expect, it, vi } from 'vitest';
import { EXTRACTION_PROMPT } from './ai/extraction';
import { createDependencies, handleRequest } from './app';
import worker from './index';
import * as entry from './index';

function photoRequest() {
  const form = new FormData();
  form.append('image', new File(['photo bytes'], 'pack.jpg', { type: 'image/jpeg' }));
  return new Request('https://api.counterfeitiq.test/api/analyze', { method: 'POST', body: form });
}

function lookup(number: string) {
  return new Request(`https://api.counterfeitiq.test/api/reference/${number}`);
}

afterEach(() => vi.unstubAllGlobals());

describe('Cloudflare Worker entrypoint', () => {
  it('exports only the default handler, as the Workers runtime requires', () => {
    expect(Object.keys(entry)).toEqual(['default']);
  });

  it('handles CORS OPTIONS preflight', async () => {
    const request = new Request('https://api.counterfeitiq.test/api/health', { method: 'OPTIONS' });
    const response = await handleRequest(request);
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });

  it('serves health endpoint with CORS and status ok', async () => {
    const request = new Request('https://api.counterfeitiq.test/api/health');
    const response = await worker.fetch(request);
    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    const body = await response.json() as { status: string; service: string };
    expect(body.status).toBe('ok');
    expect(body.service).toBe('counterfeitiq-api');
  });

  it('routes GET /api/reference/:number to reference lookup', async () => {
    const request = new Request('https://api.counterfeitiq.test/api/reference/A1-123456');
    const response = await worker.fetch(request);
    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    const body = await response.json() as { status: string; record?: { productName: string } };
    expect(body.status).toBe('FOUND');
    expect(body.record?.productName).toBe('Example Medicine');
  });

  it('routes POST /api/analyze and rejects empty payload with standardized error', async () => {
    const request = new Request('https://api.counterfeitiq.test/api/analyze', { method: 'POST' });
    const response = await worker.fetch(request);
    expect(response.status).toBe(415);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('returns 404 for unknown route with CORS headers', async () => {
    const request = new Request('https://api.counterfeitiq.test/api/unknown');
    const response = await worker.fetch(request);
    expect(response.status).toBe(404);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
});

describe('honest results', () => {
  it('selects a reference adapter without changing the route dependency contract', async () => {
    const demo = createDependencies({ REFERENCE_MODE: 'demo' });
    const live = createDependencies({ REFERENCE_MODE: 'authorized_live' });

    await expect(demo.lookupMedicine('A1-123456')).resolves.toMatchObject({
      status: 'FOUND',
      provenance: { mode: 'DEMO_FIXTURE', authoritative: false },
    });
    await expect(live.lookupMedicine('A1-123456')).resolves.toMatchObject({
      status: 'SOURCE_UNAVAILABLE',
      provenance: { mode: 'NOT_EXECUTED', authoritative: false },
    });
  });

  it('fails instead of inventing a product when no model is configured', async () => {
    const response = await worker.fetch(photoRequest());
    expect(response.status).toBe(503);
    const body = await response.json() as { error: { code: string }; extracted?: unknown };
    expect(body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(body.extracted).toBeUndefined();
  });

  it.each(['A1-000000', 'A1-999999', 'A6-100103', 'B2-777777'])(
    'never claims a NAFDAC result for %s without a live lookup',
    async (number) => {
      const body = await (await worker.fetch(lookup(number))).json() as {
        status: string;
        provenance: { mode: string; authoritative: boolean };
      };
      expect(body.status).toBe('SOURCE_UNAVAILABLE');
      expect(body.provenance.mode).not.toBe('LIVE_OFFICIAL');
      expect(body.provenance.authoritative).toBe(false);
    },
  );

  it('does not serve fixtures as live data in authorized_live mode', async () => {
    const response = await worker.fetch(lookup('A1-123456'), { REFERENCE_MODE: 'authorized_live' });
    const body = await response.json() as { status: string; record: unknown; provenance: { mode: string } };
    expect(body.status).toBe('SOURCE_UNAVAILABLE');
    expect(body.record).toBeNull();
    expect(body.provenance.mode).toBe('NOT_EXECUTED');
  });
});

describe('Gemma extraction', () => {
  const env = { GEMMA_API_KEY: 'test-key', GEMMA_API_URL: 'https://model.test/v1/chat' };
  const product = {
    category: 'medicine', productName: 'Example Medicine', brand: null, nafdacNumber: 'A1-123456',
    manufacturer: 'Example Pharma Ltd', strength: '500 mg', ingredients: ['Exampleol'],
    batchNumber: null, manufacturingDate: null, expiryDate: '2027-06',
  };

  function modelReplies(content: string) {
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json({ choices: [{ message: { content } }] }));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('tells the model every contract field and forbids guessing', async () => {
    const fetchMock = modelReplies(JSON.stringify(product));
    await worker.fetch(photoRequest(), env);
    const sent = String(fetchMock.mock.calls[0]?.[1]?.body);
    for (const key of Object.keys(product)) {
      expect(EXTRACTION_PROMPT).toContain(key);
    }
    expect(sent).toContain('Never guess');
    expect(sent).toContain('data:image/jpeg;base64,');
  });

  it('turns model output into a report, even when wrapped in a code fence', async () => {
    modelReplies(`\`\`\`json\n${JSON.stringify(product)}\n\`\`\``);
    const response = await worker.fetch(photoRequest(), env);
    expect(response.status).toBe(200);
    const body = await response.json() as { extracted: { productName: string }; verification: { physicalAuthenticityConfirmed: boolean } };
    expect(body.extracted.productName).toBe('Example Medicine');
    expect(body.verification.physicalAuthenticityConfirmed).toBe(false);
  });

  it('rejects model output that does not follow the contract', async () => {
    modelReplies('{"product_name":"Example Medicine"}');
    const response = await worker.fetch(photoRequest(), env);
    expect(response.status).toBe(503);
  });

  it('encodes a full-size image without failing', async () => {
    const fetchMock = modelReplies(JSON.stringify(product));
    const form = new FormData();
    form.append('image', new File([new Uint8Array(4 * 1024 * 1024)], 'pack.jpg', { type: 'image/jpeg' }));
    const response = await worker.fetch(new Request('https://api.counterfeitiq.test/api/analyze', { method: 'POST', body: form }), env);
    expect(response.status).toBe(200);
    expect(String(fetchMock.mock.calls[0]?.[1]?.body).length).toBeGreaterThan(5_000_000);
  });
});
