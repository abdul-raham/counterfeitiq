import { beforeEach, describe, expect, it } from 'vitest';
import { handleRequest } from '../app';
import { ErpUnavailableError, simulatedErp, type ErpAdapter } from './erp';
import { hasValidCheckDigit, parseIdentifier } from './identifier';
import { resolveIdentifier, resolveRequest } from './resolve';
import { ScanEventStore } from './scanEvents';

const GTIN = '2000000000015';
const GS = '\u001d';
const NOW = new Date('2026-10-31T12:00:00.000Z');
let scanEvents: ScanEventStore;

const resolve = (code: string, recordScan = true, session: unknown = null) =>
  resolveIdentifier(parseIdentifier(code), recordScan, session, { scanEvents, now: () => NOW });

beforeEach(() => {
  scanEvents = new ScanEventStore();
});

describe('parseIdentifier', () => {
  it.each([
    [GTIN, '02000000000015'],
    ['02000000000015', '02000000000015'],
    ['96385074', '00000096385074'],
    ['036000291452', '00036000291452'],
  ])('reads the plain barcode %s', (code, gtin) => {
    expect(parseIdentifier(code)).toMatchObject({ type: 'GTIN', gtin, batch: null, serial: null });
  });

  it('flags a failed check digit rather than treating it as a product', () => {
    expect(parseIdentifier('2000000000016')).toMatchObject({ type: 'UNKNOWN', gtin: null, badCheckDigit: true });
  });

  it.each([
    ['bracketed', '(01)02000000000015(10)ZEN2401(17)280630(21)SN0001', 'GS1_DATAMATRIX'],
    ['a Data Matrix element string', `010200000000001517280630${'10'}ZEN2401${GS}21SN0001`, 'GS1_DATAMATRIX'],
    ['a Data Matrix with its symbology prefix', `]d2010200000000001510ZEN2401${GS}17280630${'21'}SN0001`, 'GS1_DATAMATRIX'],
    ['a Digital Link', 'https://id.gs1.org/01/02000000000015/10/ZEN2401/21/SN0001?17=280630', 'SERIALIZED'],
  ])('reads %s', (_name, code, type) => {
    expect(parseIdentifier(code)).toMatchObject({ type, gtin: '02000000000015', batch: 'ZEN2401', serial: 'SN0001', expiry: '280630' });
  });

  it.each([
    ['batch, expiry, serial', '010200000000001510ZEN24011728063021SN0001'],
    ['expiry, batch, serial', '010200000000001517280630' + '10ZEN2401' + '21SN0001'],
    ['serial, expiry, batch', '010200000000001521SN00011728063010ZEN2401'],
  ])('reads a Data Matrix whose scanner dropped the separators: %s', (_name, code) => {
    expect(parseIdentifier(code)).toMatchObject({ gtin: '02000000000015', batch: 'ZEN2401', serial: 'SN0001', expiry: '280630' });
  });

  it('reads the exact string a real scan produced, with its leading GS', () => {
    expect(parseIdentifier(`${GS}010200000000001510ZEN2401${GS}1728063021SN0001`)).toMatchObject({
      type: 'GS1_DATAMATRIX', gtin: '02000000000015', batch: 'ZEN2401', serial: 'SN0001', expiry: '280630',
      normalized: '(01)02000000000015(10)ZEN2401(17)280630(21)SN0001',
    });
  });

  it('does not take an impossible date as a field boundary', () => {
    expect(parseIdentifier('010200000000001510ZEN1799999921SN0001')).toMatchObject({ batch: 'ZEN17999999', serial: 'SN0001', expiry: null });
  });

  it('normalizes every form to the same readable identifier', () => {
    expect(parseIdentifier(`010200000000001510ZEN2401${GS}21SN0001`).normalized).toBe('(01)02000000000015(10)ZEN2401(21)SN0001');
  });

  it.each(['hello world', 'javascript:alert(1)', 'https://example.test/nothing', '(01)123', '(99)ABC'])('treats %s as unknown', (code) => {
    expect(parseIdentifier(code)).toMatchObject({ type: 'UNKNOWN', gtin: null });
  });

  it('checks digits correctly', () => {
    expect(hasValidCheckDigit('02000000000015')).toBe(true);
    expect(hasValidCheckDigit('02000000000014')).toBe(false);
  });
});

describe('resolving', () => {
  it('resolves a plain barcode to the product only, labelled as a demo', async () => {
    const result = await resolve(GTIN);
    expect(result).toMatchObject({ identityLevel: 'PRODUCT', batch: null, pack: null, scanSummary: null });
    expect(result.product?.name).toBe('Zenoril 500 mg Tablets');
    expect(result.manufacturer?.name).toBe('Zenora Pharma Ltd');
    expect(result.source).toMatchObject({ type: 'DEMO_ERP', status: 'FOUND', retrievedAt: NOW.toISOString() });
    expect(result.warnings).toEqual([]);
    expect(result.limitations.join(' ')).toMatch(/every pack/i);
  });

  it('resolves batch details', async () => {
    const result = await resolve('(01)02000000000015(10)ZEN2401(17)280630');
    expect(result.identityLevel).toBe('BATCH');
    expect(result.batch?.expiryDate).toBe('2028-06-30');
    expect(result.pack).toBeNull();
    expect(result.warnings).toEqual([]);
  });

  it('resolves a serialized pack', async () => {
    const result = await resolve('(01)02000000000015(10)ZEN2401(17)280630(21)SN0001');
    expect(result.identityLevel).toBe('PACK');
    expect(result.pack).toEqual({ serialNumber: 'SN0001', status: 'In distribution' });
    expect(result.warnings).toEqual([]);
  });

  it('finds the batch from the serial when the code does not state it', async () => {
    expect((await resolve('(01)02000000000015(21)SN0001')).batch?.batchNumber).toBe('ZEN2401');
  });

  it.each([
    ['BATCH_RECALLED', '(01)02000000000015(21)SN0003', 'HIGH'],
    ['BATCH_EXPIRED', '(01)02000000000015(21)SN0002', 'HIGH'],
    ['PACK_NOT_ON_RECORD', '(01)02000000000015(21)NOPE', 'WARNING'],
    ['BATCH_NOT_ON_RECORD', '(01)02000000000015(10)NOPE', 'WARNING'],
    ['PACK_BATCH_MISMATCH', '(01)02000000000015(10)ZEN2302(21)SN0001', 'HIGH'],
    ['EXPIRY_MISMATCH', '(01)02000000000015(10)ZEN2401(17)270101', 'WARNING'],
  ])('warns with %s', async (code, identifier, severity) => {
    const result = await resolve(identifier);
    expect(result.warnings).toContainEqual(expect.objectContaining({ code, severity }));
    expect(JSON.stringify(result)).not.toMatch(/counterfeit|\bfake\b/i);
  });

  it('separates not found, misread and unavailable', async () => {
    expect((await resolve('2000000000046')).source.status).toBe('NOT_FOUND');
    const misread = await resolve('2000000000016');
    expect(misread.source.status).toBe('NOT_FOUND');
    expect(misread.warnings[0]?.code).toBe('CHECK_DIGIT_FAILED');
    const offline = await resolve('2000000000039');
    expect(offline.source.status).toBe('UNAVAILABLE');
    expect(offline.product).toBeNull();
  });

  it('reports a failing or unexpected adapter as unavailable, never as not found', async () => {
    const down: ErpAdapter = { ...simulatedErp, findByGtin: async () => { throw new ErpUnavailableError(); } };
    const broken: ErpAdapter = { ...simulatedErp, findByGtin: async () => { throw new TypeError('bug'); } };
    for (const erp of [down, broken]) {
      const result = await resolveIdentifier(parseIdentifier(GTIN), true, null, { erp, scanEvents });
      expect(result.source.status).toBe('UNAVAILABLE');
      expect(scanEvents.size).toBe(0);
    }
  });

  it('labels a real adapter by its own source type', async () => {
    const erp: ErpAdapter = { ...simulatedErp, sourceType: 'AUTHORIZED_ERP', sourceName: 'Example ERP' };
    expect((await resolveIdentifier(parseIdentifier(GTIN), false, null, { erp, scanEvents })).source).toMatchObject({ type: 'AUTHORIZED_ERP', name: 'Example ERP' });
  });
});

describe('scan events', () => {
  const pack = '(01)02000000000015(21)SN0001';

  it('counts repeat scans of a serialized pack, without any verdict', async () => {
    expect((await resolve(pack)).scanSummary).toMatchObject({ previousScans: 0, firstScannedAt: null });
    const second = await resolve(pack);
    expect(second.scanSummary).toMatchObject({ previousScans: 1, firstScannedAt: NOW.toISOString() });
    expect(second.scanSummary?.persistenceNote).toMatch(/temporary/);
    expect((await resolve(pack)).scanSummary?.previousScans).toBe(2);
    expect(second.warnings).toEqual([]);
  });

  it('treats different forms of one pack as the same pack', async () => {
    await resolve(pack);
    expect((await resolve(`010200000000001521SN0001`)).scanSummary?.previousScans).toBe(1);
  });

  it('never reports repeats for a shared barcode or a batch', async () => {
    for (const code of [GTIN, '(01)02000000000015(10)ZEN2401']) {
      await resolve(code);
      expect((await resolve(code)).scanSummary).toBeNull();
    }
    expect(scanEvents.size).toBe(4);
  });

  it('does not count a page reload as a scan', async () => {
    await resolve(pack, false);
    await resolve(pack, false);
    expect(scanEvents.size).toBe(0);
    expect((await resolve(pack)).scanSummary?.previousScans).toBe(0);
  });

  it('records no event for a code with no record', async () => {
    await resolve('2000000000046');
    expect(scanEvents.size).toBe(0);
  });

  it('keeps a valid anonymous session ID and drops anything else', async () => {
    const session = '123e4567-e89b-12d3-a456-426614174000';
    await resolve(GTIN, true, session);
    expect(scanEvents.latest()?.anonymousSessionId).toBe(session);
    await resolve(GTIN, true, 'someone@example.test');
    expect(scanEvents.latest()?.anonymousSessionId).toBeNull();
  });
});

describe('POST /api/v3/resolve', () => {
  const post = (body: unknown, headers: Record<string, string> = { 'Content-Type': 'application/json' }) =>
    new Request('https://w.test/api/v3/resolve', { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) });

  it('resolves through the Worker with CORS for an allowed origin', async () => {
    const request = post({ identifier: GTIN, recordScan: false, anonymousSessionId: null }, { 'Content-Type': 'application/json', Origin: 'https://app.test' });
    const response = await handleRequest(request, { ALLOWED_ORIGINS: 'https://app.test' });
    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://app.test');
    expect((await response.json() as { product: { name: string } }).product.name).toBe('Zenoril 500 mg Tablets');
  });

  it.each([
    ['bad JSON', () => post('{nope')],
    ['the wrong content type', () => post('{}', { 'Content-Type': 'text/plain' })],
    ['a missing identifier', () => post({})],
    ['a non-string identifier', () => post({ identifier: 5 })],
    ['an over-long identifier', () => post({ identifier: 'x'.repeat(300) })],
    ['an oversized body', () => post({ identifier: GTIN, padding: 'x'.repeat(3000) })],
  ])('rejects %s', async (_name, build) => {
    expect((await resolveRequest(build(), { scanEvents })).status).toBe(400);
  });

  it('rate limits through the Worker', async () => {
    const response = await handleRequest(post({ identifier: GTIN }), { REFERENCE_LIMITER: { limit: async () => ({ success: false }) } });
    expect(response.status).toBe(429);
  });

  it('only accepts POST', async () => {
    expect((await handleRequest(new Request('https://w.test/api/v3/resolve'))).status).toBe(405);
  });

  it('counts a scan only when asked to', async () => {
    await resolveRequest(post({ identifier: GTIN, recordScan: 'yes' }), { scanEvents });
    expect(scanEvents.size).toBe(0);
    await resolveRequest(post({ identifier: GTIN, recordScan: true }), { scanEvents });
    expect(scanEvents.size).toBe(1);
  });
});
