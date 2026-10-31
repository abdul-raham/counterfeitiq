import { MAX_IMAGE_BYTES } from '@counterfeitiq/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { canonicalNafdacNumber, lookupMedicine } from './adapters/reference';
import { EXTRACTION_PROMPT, extractProduct, parseModelOutput } from './ai/extraction';
import { handleRequest, type Env } from './app';
import { AnalysisApiError } from './routes/errors';

const JPEG = [0xff, 0xd8, 0xff, 0xe0];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const WEBP = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];

const readable = {
  category: 'medicine', productName: 'Example Medicine', brand: null, nafdacNumber: 'A1-123456',
  manufacturer: 'Example Pharma Ltd', strength: '500 mg', ingredients: ['Exampleol'],
  batchNumber: null, manufacturingDate: null, expiryDate: '2027-06',
};
const blurry = {
  category: null, productName: null, brand: null, nafdacNumber: null, manufacturer: null,
  strength: null, ingredients: [], batchNumber: null, manufacturingDate: null, expiryDate: null,
};

function modelReturning(content: unknown, finish_reason = 'stop') {
  return { run: vi.fn(async () => ({ choices: [{ message: { content }, finish_reason }] })) };
}

function envWith(ai: Env['AI'], extra: Env = {}): Env {
  return { AI: ai, GEMMA_MODEL: '@cf/google/gemma-4-26b-a4b-it', ...extra };
}

function upload(bytes: number[] | Uint8Array, type = 'image/jpeg') {
  const form = new FormData();
  form.append('image', new File([new Uint8Array(bytes)], 'pack', { type }));
  return new Request('https://api.test/api/analyze', { method: 'POST', body: form });
}

function chunkedUpload(totalBytes: number) {
  const chunk = new Uint8Array(1024 * 1024);
  let sent = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= totalBytes) return controller.close();
      sent += chunk.byteLength;
      controller.enqueue(chunk);
    },
  });
  return {
    pulled: () => sent,
    request: new Request('https://api.test/api/analyze', {
      method: 'POST',
      headers: { 'content-type': 'multipart/form-data; boundary=x' },
      body,
      duplex: 'half',
    } as RequestInit),
  };
}

async function errorOf(response: Response) {
  return (await response.json() as { error: { code: string; retryable: boolean; message: string } }).error;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('image input', () => {
  it.each([['image/jpeg', JPEG], ['image/png', PNG], ['image/webp', WEBP]])(
    'sends a valid %s to the model with its real type', async (type, bytes) => {
      const ai = modelReturning(JSON.stringify(readable));
      const response = await handleRequest(upload(bytes as number[], type as string), envWith(ai));
      expect(response.status).toBe(200);
      expect(JSON.stringify(ai.run.mock.calls[0])).toContain(`data:${type};base64,`);
    },
  );

  it('tells the model not to name a product it cannot read', () => {
    expect(EXTRACTION_PROMPT).toContain('letter by letter');
    expect(EXTRACTION_PROMPT).toContain('Never identify a product from its colours, layout or shape');
  });

  it('reports what a blurry photo shows and nothing more', async () => {
    const response = await handleRequest(upload(JPEG), envWith(modelReturning(JSON.stringify(blurry))));
    expect(response.status).toBe(200);
    const body = await response.json() as {
      extracted: typeof blurry; reference: unknown; verification: { status: string; physicalAuthenticityConfirmed: boolean };
    };
    expect(body.extracted.nafdacNumber).toBeNull();
    expect(body.reference).toBeNull();
    expect(body.verification.status).toBe('INSUFFICIENT_EVIDENCE');
    expect(body.verification.physicalAuthenticityConfirmed).toBe(false);
  });

  it.each([
    ['bytes that are not an image', [1, 2, 3, 4, 5], 'image/jpeg'],
    ['a PNG declared as JPEG', PNG, 'image/jpeg'],
    ['a truncated signature', [0xff], 'image/jpeg'],
  ])('rejects %s without calling the model', async (_name, bytes, type) => {
    const ai = modelReturning(JSON.stringify(readable));
    const response = await handleRequest(upload(bytes, type), envWith(ai));
    expect(response.status).toBe(415);
    expect(await errorOf(response)).toMatchObject({ code: 'INVALID_FILE_TYPE', retryable: false });
    expect(ai.run).not.toHaveBeenCalled();
  });

  it('rejects an empty image', async () => {
    const response = await handleRequest(upload([]), envWith(modelReturning('{}')));
    expect(response.status).toBe(422);
    expect((await errorOf(response)).code).toBe('UNREADABLE_IMAGE');
  });

  it('rejects a declared type outside the accepted list', async () => {
    const ai = modelReturning('{}');
    const response = await handleRequest(upload(JPEG, 'image/gif'), envWith(ai));
    expect(response.status).toBe(415);
    expect(ai.run).not.toHaveBeenCalled();
  });

  it('rejects an oversized image within the multipart allowance', async () => {
    const ai = modelReturning('{}');
    const response = await handleRequest(upload(new Uint8Array(MAX_IMAGE_BYTES + 1)), envWith(ai));
    expect(response.status).toBe(413);
    expect((await errorOf(response)).code).toBe('FILE_TOO_LARGE');
    expect(ai.run).not.toHaveBeenCalled();
  });
});

describe('oversized request protection', () => {
  it('rejects a declared oversized body before reading it', async () => {
    const request = new Request('https://api.test/api/analyze', {
      method: 'POST',
      headers: { 'content-type': 'multipart/form-data; boundary=x', 'content-length': String(50 * 1024 * 1024) },
      body: 'x',
    });
    const response = await handleRequest(request, envWith(modelReturning('{}')));
    expect(response.status).toBe(413);
  });

  it('stops reading a chunked body with no Content-Length at the limit', async () => {
    const { request, pulled } = chunkedUpload(64 * 1024 * 1024);
    expect(request.headers.get('content-length')).toBeNull();
    const response = await handleRequest(request, envWith(modelReturning('{}')));
    expect(response.status).toBe(413);
    expect(pulled()).toBeLessThan(8 * 1024 * 1024);
  });
});

describe('provider failures', () => {
  it('returns a retryable timeout when the model does not answer', async () => {
    vi.useFakeTimers();
    const pending = extractProduct(new File([new Uint8Array(JPEG)], 'pack', { type: 'image/jpeg' }), {
      ai: { run: () => new Promise(() => undefined) }, model: 'm', timeoutMs: 1000,
    }).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(1001);
    const error = await pending as AnalysisApiError;
    expect(error).toBeInstanceOf(AnalysisApiError);
    expect(error.detail).toMatchObject({ code: 'MODEL_TIMEOUT', retryable: true });
  });

  it.each(['3040: Capacity temporarily exceeded', '3036: daily free allocation used', 'HTTP 429'])(
    'maps provider rate limit "%s" to RATE_LIMITED', async (message) => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const ai = { run: vi.fn(async () => { throw new Error(message); }) };
      const response = await handleRequest(upload(JPEG), envWith(ai));
      expect(response.status).toBe(429);
      expect(await errorOf(response)).toMatchObject({ code: 'RATE_LIMITED', retryable: true });
    },
  );

  it('answers SERVICE_UNAVAILABLE, never a mock, when no provider is bound', async () => {
    for (const env of [{}, { GEMMA_MODEL: 'm' }, { AI: modelReturning('{}') }] as Env[]) {
      const response = await handleRequest(upload(JPEG), env);
      expect(response.status).toBe(503);
      const body = await response.json() as { error: { code: string }; extracted?: unknown };
      expect(body.error.code).toBe('SERVICE_UNAVAILABLE');
      expect(body.extracted).toBeUndefined();
    }
  });

  it.each([
    ['prose around JSON', `Here you go: ${JSON.stringify(readable)} hope that helps`],
    ['not JSON', 'I cannot read this image.'],
    ['an array', '[]'],
    ['a missing key', JSON.stringify({ ...readable, batchNumber: undefined })],
    ['an extra key', JSON.stringify({ ...readable, confidence: 0.9 })],
    ['a wrong value type', JSON.stringify({ ...readable, strength: 500 })],
    ['ingredients as a string', JSON.stringify({ ...readable, ingredients: 'Exampleol' })],
    ['an unknown category', JSON.stringify({ ...readable, category: 'gadget' })],
    ['an empty reply', ''],
    ['a non-text reply', { nested: true }],
  ])('turns %s into a standard retryable error', async (_name, content) => {
    const response = await handleRequest(upload(JPEG), envWith(modelReturning(content)));
    expect(response.status).toBe(503);
    expect(await errorOf(response)).toMatchObject({ code: 'SERVICE_UNAVAILABLE', retryable: true });
  });

  it('treats a reply cut off by the token limit as malformed', async () => {
    const response = await handleRequest(upload(JPEG), envWith(modelReturning(JSON.stringify(readable), 'length')));
    expect(await errorOf(response)).toMatchObject({ code: 'SERVICE_UNAVAILABLE', retryable: true });
  });

  it('turns placeholder words into null instead of evidence', () => {
    const parsed = parseModelOutput(JSON.stringify({ ...readable, nafdacNumber: 'N/A', batchNumber: ' unknown ' }));
    expect(parsed.nafdacNumber).toBeNull();
    expect(parsed.batchNumber).toBeNull();
  });
});

describe('reference numbers', () => {
  it.each(['A1-123456', 'a1-123456', ' A1-123456 ', 'A1 123456', 'A1–123456', 'NAFDAC REG NO: A1-123456'])(
    'matches the same number written as "%s"', async (number) => {
      expect((await lookupMedicine(number)).status).toBe('FOUND');
    },
  );

  it.each(['A11-23456', 'A1123456', 'A1-12345', 'A1-1234567', 'A1-123457', 'B1-123456'])(
    'does not match the different number %s', async (number) => {
      const result = await lookupMedicine(number);
      expect(result.status).toBe('SOURCE_UNAVAILABLE');
      expect(result.record).toBeNull();
    },
  );

  it.each(['hello', '---', '', 'A1-123456; DROP', 'A'.repeat(21)])('rejects implausible input "%s"', (value) => {
    expect(canonicalNafdacNumber(value)).toBeNull();
  });
});

describe('demo provenance', () => {
  const now = () => new Date('2026-10-31T12:00:00.000Z');

  it('labels a fixture hit as non-authoritative demo data', async () => {
    const result = await lookupMedicine('A1-123456', { mode: 'demo', now });
    expect(result.provenance).toMatchObject({ source: 'DEMO_FIXTURE', mode: 'DEMO_FIXTURE', authoritative: false });
    expect(result.provenance.note).toContain('demo');
  });

  it('never turns a fixture miss into an official NOT_FOUND', async () => {
    const result = await lookupMedicine('A9-999999', { mode: 'demo', now });
    expect(result.status).toBe('SOURCE_UNAVAILABLE');
    expect(result.provenance.authoritative).toBe(false);
  });

  it('keeps fixture status visible in a full analysis', async () => {
    const response = await handleRequest(upload(JPEG), envWith(modelReturning(JSON.stringify(readable)), { REFERENCE_MODE: 'demo' }));
    const body = await response.json() as {
      reference: { provenance: { mode: string; authoritative: boolean } };
      verification: { summary: string };
    };
    expect(body.reference.provenance).toMatchObject({ mode: 'DEMO_FIXTURE', authoritative: false });
    expect(body.verification.summary).toContain('demo fixture');
  });
});

describe('source failure', () => {
  it('stays unavailable in authorized_live mode until an authorized adapter exists', async () => {
    const result = await lookupMedicine('A1-123456', { mode: 'authorized_live' });
    expect(result).toMatchObject({ status: 'SOURCE_UNAVAILABLE', record: null });
    expect(result.provenance).toMatchObject({ source: 'NONE', mode: 'NOT_EXECUTED', authoritative: false });
  });

  it('reports the reference as unavailable in analysis rather than failing the scan', async () => {
    const response = await handleRequest(
      upload(JPEG),
      envWith(modelReturning(JSON.stringify(readable)), { REFERENCE_MODE: 'authorized_live' }),
    );
    expect(response.status).toBe(200);
    const body = await response.json() as { verification: { status: string } };
    expect(body.verification.status).toBe('REFERENCE_UNAVAILABLE');
  });
});

describe('CORS', () => {
  const env: Env = { ALLOWED_ORIGINS: 'https://app.test, http://localhost:5173' };
  const health = (origin?: string, method = 'GET') => new Request('https://api.test/api/health', {
    method,
    headers: origin ? { Origin: origin } : {},
  });

  it('allows a listed origin, on preflight and on the response', async () => {
    const preflight = await handleRequest(health('https://app.test', 'OPTIONS'), env);
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe('https://app.test');
    expect(preflight.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    const response = await handleRequest(health('http://localhost:5173'), env);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
    expect(response.headers.get('Vary')).toContain('Origin');
  });

  it.each(['https://evil.test', 'https://app.test.evil.test', 'null'])('does not allow %s', async (origin) => {
    const response = await handleRequest(health(origin), env);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('allows nothing when no origins are configured, and never a wildcard', async () => {
    const response = await handleRequest(health('https://app.test'), {});
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('keeps CORS headers on error responses', async () => {
    const request = new Request('https://api.test/api/unknown', { headers: { Origin: 'https://app.test' } });
    const response = await handleRequest(request, env);
    expect(response.status).toBe(404);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://app.test');
  });
});

describe('request rate limiting', () => {
  const denied = { limit: vi.fn(async () => ({ success: false })) };

  it('refuses analysis over the limit before calling the model', async () => {
    const ai = modelReturning(JSON.stringify(readable));
    const request = upload(JPEG);
    const headers = new Headers(request.headers);
    headers.set('cf-connecting-ip', '203.0.113.9');
    const response = await handleRequest(new Request(request, { headers }), envWith(ai, { ANALYZE_LIMITER: denied }));
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('60');
    expect(await errorOf(response)).toMatchObject({ code: 'RATE_LIMITED', retryable: true });
    expect(ai.run).not.toHaveBeenCalled();
    expect(denied.limit).toHaveBeenCalledWith({ key: '203.0.113.9' });
  });

  it('refuses manual lookups over the limit', async () => {
    const response = await handleRequest(new Request('https://api.test/api/reference/A1-123456'), { REFERENCE_LIMITER: denied });
    expect(response.status).toBe(429);
  });
});

describe('credentials', () => {
  const secret = 'cfut_SECRET_TOKEN_VALUE';

  it('keeps provider error text out of logs and responses', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const)
      .map((level) => vi.spyOn(console, level).mockImplementation(() => undefined));
    const ai = { run: vi.fn(async () => { throw new Error(`upstream failed, authorization: Bearer ${secret}`); }) };

    const response = await handleRequest(upload(JPEG), envWith(ai));

    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain(secret);
    expect(JSON.stringify(spies.flatMap((spy) => spy.mock.calls))).not.toContain(secret);
  });

  it('does not expose configuration values through health', async () => {
    const response = await handleRequest(
      new Request('https://api.test/api/health'),
      envWith(modelReturning('{}'), { GEMMA_MODEL: secret }),
    );
    expect(await response.text()).not.toContain(secret);
  });
});
