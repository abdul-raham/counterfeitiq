import { describe, expect, it, vi } from 'vitest';
import { EXTRACTION_PROMPT } from './ai/extraction';
import { handleRequest } from './app';
import worker from './index';
import * as entry from './index';

function photoRequest() {
  const form = new FormData();
  form.append('image', new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], 'pack.jpg', { type: 'image/jpeg' }));
  return new Request('https://api.counterfeitiq.test/api/analyze', { method: 'POST', body: form });
}

function lookup(number: string) {
  return new Request(`https://api.counterfeitiq.test/api/reference/${number}`);
}


describe('Cloudflare Worker entrypoint', () => {
  it('exports only the default handler, as the Workers runtime requires', () => {
    expect(Object.keys(entry)).toEqual(['default']);
  });

  const corsEnv = { ALLOWED_ORIGINS: 'https://app.test' };
  const headers = { Origin: 'https://app.test' };

  it('handles CORS OPTIONS preflight', async () => {
    const request = new Request('https://api.counterfeitiq.test/api/health', { method: 'OPTIONS', headers });
    const response = await handleRequest(request, corsEnv);
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://app.test');
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });

  it('serves health endpoint with CORS and status ok', async () => {
    const request = new Request('https://api.counterfeitiq.test/api/health', { headers });
    const response = await worker.fetch(request, corsEnv);
    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://app.test');
    const body = await response.json() as { status: string; service: string };
    expect(body.status).toBe('ok');
    expect(body.service).toBe('counterfeitiq-api');
  });

  it('routes GET /api/reference/:number to reference lookup', async () => {
    const request = new Request('https://api.counterfeitiq.test/api/reference/A1-123456', { headers });
    const response = await worker.fetch(request, corsEnv);
    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://app.test');
    const body = await response.json() as { status: string; record?: { productName: string } };
    expect(body.status).toBe('FOUND');
    expect(body.record?.productName).toBe('Example Medicine');
  });

  it('routes POST /api/analyze and rejects empty payload with standardized error', async () => {
    const request = new Request('https://api.counterfeitiq.test/api/analyze', { method: 'POST', headers });
    const response = await worker.fetch(request, corsEnv);
    expect(response.status).toBe(415);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://app.test');
  });

  it('returns 404 for unknown route with CORS headers', async () => {
    const request = new Request('https://api.counterfeitiq.test/api/unknown', { headers });
    const response = await worker.fetch(request, corsEnv);
    expect(response.status).toBe(404);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://app.test');
  });
});

describe('honest results', () => {
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
  const product = {
    category: 'medicine', productName: 'Example Medicine', brand: null, nafdacNumber: 'A1-123456',
    manufacturer: 'Example Pharma Ltd', strength: '500 mg', ingredients: ['Exampleol'],
    batchNumber: null, manufacturingDate: null, expiryDate: '2027-06',
  };

  function modelReplies(content: string) {
    const run = vi.fn<(model: string, input: unknown) => Promise<unknown>>(
      async () => ({ choices: [{ message: { content } }] }),
    );
    return { run, env: { AI: { run }, GEMMA_MODEL: '@cf/google/gemma-4-26b-a4b-it' } };
  }

  it('tells the model every contract field and forbids guessing', async () => {
    const { run, env } = modelReplies(JSON.stringify(product));
    await worker.fetch(photoRequest(), env);
    expect(run.mock.calls[0]?.[0]).toBe('@cf/google/gemma-4-26b-a4b-it');
    const sent = JSON.stringify(run.mock.calls[0]?.[1]);
    for (const key of Object.keys(product)) {
      expect(EXTRACTION_PROMPT).toContain(key);
    }
    expect(sent).toContain('Never guess');
    expect(sent).toContain('data:image/jpeg;base64,');
  });

  it('turns model output into a report, even when wrapped in a code fence', async () => {
    const { env } = modelReplies(`\`\`\`json\n${JSON.stringify(product)}\n\`\`\``);
    const response = await worker.fetch(photoRequest(), env);
    expect(response.status).toBe(200);
    const body = await response.json() as { extracted: { productName: string }; verification: { physicalAuthenticityConfirmed: boolean } };
    expect(body.extracted.productName).toBe('Example Medicine');
    expect(body.verification.physicalAuthenticityConfirmed).toBe(false);
  });

  it('rejects model output that does not follow the contract', async () => {
    const { env } = modelReplies('{"product_name":"Example Medicine"}');
    const response = await worker.fetch(photoRequest(), env);
    expect(response.status).toBe(503);
  });

  it('encodes a full-size image without failing', async () => {
    const { run, env } = modelReplies(JSON.stringify(product));
    const image = new Uint8Array(4 * 1024 * 1024);
    image.set([0xff, 0xd8, 0xff, 0xe0]);
    const form = new FormData();
    form.append('image', new File([image], 'pack.jpg', { type: 'image/jpeg' }));
    const response = await worker.fetch(new Request('https://api.counterfeitiq.test/api/analyze', { method: 'POST', body: form }), env);
    expect(response.status).toBe(200);
    expect(JSON.stringify(run.mock.calls[0]?.[1]).length).toBeGreaterThan(5_000_000);
  });
});
