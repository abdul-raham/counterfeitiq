import { describe, expect, it } from 'vitest';
import worker, { handleRequest } from './index';

describe('Cloudflare Worker entrypoint', () => {
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
