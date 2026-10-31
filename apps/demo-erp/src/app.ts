import { AS_OF, ITEMS, LOTS, PACKS } from './seed';

export interface Env {
  DEMO_ERP_TOKEN?: string;
}

const SOURCE_NAME = 'CounterfeitIQ simulated ERP';

function envelope(data: unknown): Response {
  return Response.json({ fictional: true, source: SOURCE_NAME, as_of: AS_OF, data });
}

const fail = (status: number, message: string) => Response.json({ fictional: true, error: message }, { status });

/** A simulated manufacturer ERP. The wire format differs from CounterfeitIQ's on purpose. */
export async function handleRequest(request: Request, env: Env = {}): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (request.method !== 'GET') return new Response(null, { status: 405, headers: { Allow: 'GET' } });
  if (pathname === '/') return Response.json({ fictional: true, service: 'counterfeitiq-demo-erp' });

  if (!env.DEMO_ERP_TOKEN) return fail(503, 'The demo ERP token is not configured.');
  if (request.headers.get('Authorization') !== `Bearer ${env.DEMO_ERP_TOKEN}`) return fail(401, 'A valid token is required.');

  if (pathname === '/v1/status') {
    return envelope({ available: true, capabilities: { batches: true, packs: true } });
  }

  const parts = pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const [version, resource, gtin, child, key] = parts;
  if (version === 'v1' && resource === 'products' && gtin) {
    if (parts.length === 3) {
      const found = ITEMS.find((item) => item.gtin === gtin);
      return found ? envelope(found) : fail(404, 'No such item.');
    }
    if (parts.length === 5 && child === 'batches') {
      const found = LOTS.find((lot) => lot.gtin === gtin && lot.lot_no === key);
      return found ? envelope(found) : fail(404, 'No such lot.');
    }
    if (parts.length === 5 && child === 'packs') {
      const found = PACKS.find((pack) => pack.gtin === gtin && pack.serial === key);
      return found ? envelope(found) : fail(404, 'No such pack.');
    }
  }
  return fail(404, 'No such route.');
}
