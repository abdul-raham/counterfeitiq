import { describe, expect, it, vi } from 'vitest';
import { handleRequest } from '../app';
import { scanRequest } from './scan';

const url = (query: string) => new URL(`https://api.test/api/scan${query}`);
const request = (query: string, headers = {}) => new Request(url(query), { headers });
const service = (send: typeof fetch) => ({ url: 'https://intelligence.test', token: 'secret', fetch: send });
const calls = (send: typeof fetch) => (send as unknown as ReturnType<typeof vi.fn>).mock.calls;

describe('public scan route', () => {
  it('reports an honest error when the service is not configured', async () => {
    expect((await handleRequest(request('?identifier=123'))).status).toBe(503);
  });

  it('rejects a request with no identifier', async () => {
    const send = vi.fn() as unknown as typeof fetch;
    expect((await scanRequest(request(''), url(''), service(send))).status).toBe(400);
  });

  it('forwards the identifier and device value with the server-side token', async () => {
    const send = vi.fn(async () => Response.json({ outcome: 'RESOLVED' })) as unknown as typeof fetch;
    const response = await scanRequest(request('?identifier=123', { 'X-Scan-Device': 'device-value' }), url('?identifier=123'), service(send));
    expect(await response.json()).toEqual({ outcome: 'RESOLVED' });
    const [target, init] = calls(send)[0] as [string, RequestInit];
    expect(target).toBe('https://intelligence.test/resolve-identifier');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer secret' });
    expect(JSON.parse(init.body as string)).toEqual({ identifier: '123', deviceId: 'device-value' });
  });

  it('does not pass on a client IP address', async () => {
    const send = vi.fn(async () => Response.json({})) as unknown as typeof fetch;
    await scanRequest(request('?identifier=123', { 'cf-connecting-ip': '192.0.2.1' }), url('?identifier=123'), service(send));
    expect(JSON.stringify(calls(send)[0])).not.toContain('192.0.2.1');
  });

  it('hides a service failure behind a retryable error', async () => {
    const send = vi.fn(async () => new Response('secret detail', { status: 500 })) as unknown as typeof fetch;
    const response = await scanRequest(request('?identifier=123'), url('?identifier=123'), service(send));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('secret detail');
  });
});
