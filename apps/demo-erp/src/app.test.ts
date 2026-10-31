import { describe, expect, it } from 'vitest';
import { handleRequest } from './app';
import { GTINS, gtin14, ITEMS, LOTS, PACKS } from './seed';

const env = { DEMO_ERP_TOKEN: 'token' };
const get = (path: string, token = 'token') =>
  handleRequest(new Request(`https://erp.test${path}`, { headers: { Authorization: `Bearer ${token}` } }), env);

describe('seed data', () => {
  it('has three fictional companies with valid, restricted-range GTINs', () => {
    expect(new Set(ITEMS.map((item) => item.company).filter(Boolean)).size).toBe(4);
    expect(ITEMS.every((item) => /^\d{14}$/.test(item.gtin) && item.gtin.startsWith('0200'))).toBe(true);
    expect(gtin14('400638133393')).toBe('04006381333931');
  });

  it('uses only DEMO- registration numbers', () => {
    expect(ITEMS.every((item) => item.nafdac_reg === null || item.nafdac_reg.startsWith('DEMO-'))).toBe(true);
  });

  it('points every lot and pack at a known item', () => {
    const gtins = new Set(ITEMS.map((item) => item.gtin));
    expect([...LOTS, ...PACKS].every((row) => gtins.has(row.gtin))).toBe(true);
  });
});

describe('demo ERP API', () => {
  it('labels every answer as fictional', async () => {
    const body = await (await get(`/v1/products/${GTINS.demozol500}`)).json();
    expect(body).toMatchObject({ fictional: true, data: { description: 'Demozol 500 mg Tablets' } });
  });

  it('serves lots and packs', async () => {
    expect(await (await get(`/v1/products/${GTINS.demozol500}/batches/DX2042`)).json()).toMatchObject({ data: { lot_status: 'recalled' } });
    expect(await (await get(`/v1/products/${GTINS.demozol500}/packs/DEMOSN0001`)).json()).toMatchObject({ data: { lot_no: 'DX2041' } });
  });

  it('answers 404 for unknown records', async () => {
    expect((await get(`/v1/products/${GTINS.unlisted}`)).status).toBe(404);
    expect((await get(`/v1/products/${GTINS.demozol500}/batches/NONE`)).status).toBe(404);
  });

  it('requires its token, and fails closed without one', async () => {
    expect((await get('/v1/status', 'wrong')).status).toBe(401);
    expect((await handleRequest(new Request('https://erp.test/v1/status'), {})).status).toBe(503);
  });
});
