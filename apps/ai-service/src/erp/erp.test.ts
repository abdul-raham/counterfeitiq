import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleRequest as erpHandle } from '../../../demo-erp/src/app';
import { GTINS } from '../../../demo-erp/src/seed';
import { handleRequest, type Env, type Overrides } from '../app';
import { extractionSchema, FIELD_NAMES, type Extraction, type FieldName } from '../contract';
import { createDemoSource } from '../sources/demo';
import { comparePackagingWithErp } from './compare';
import { createHttpConnector } from './http-connector';
import { parseIdentifier, validGtin } from './identifiers';
import { resolveIdentifier, type ProductReport } from './resolve';
import { memoryScanStore, MAX_DEVICES, nextScanState } from './scan-store';
import { connectorFor } from './types';

const NOW = new Date('2026-10-31T00:00:00.000Z');
const TOKEN = 'erp-token';
const ERP_ENV = { DEMO_ERP_TOKEN: TOKEN };
// The real demo ERP handler, so tests exercise its wire format over Request and Response.
const erpFetch = (async (input: RequestInfo | URL, init?: RequestInit) =>
  erpHandle(new Request(input, init), ERP_ENV)) as typeof fetch;

const connector = (send: typeof fetch = erpFetch, sourceType: 'SIMULATED_ERP' | 'MANUFACTURER_API' = 'SIMULATED_ERP') =>
  createHttpConnector({ sourceName: 'Test ERP', sourceType, baseUrl: 'https://erp.test/', token: TOKEN, fetch: send, now: () => NOW, timeoutMs: 20 });

const resolve = (identifier: string, send?: typeof fetch, scans = memoryScanStore(), deviceId?: string) =>
  resolveIdentifier(identifier, { connectors: [connector(send)], referenceFor: () => createDemoSource(() => NOW), scans, deviceId, now: () => NOW });

const gs1 = (gtin: string, ...rest: string[]) => `(01)${gtin}${rest.join('')}`;
const down = (async () => { throw new Error('connection refused'); }) as unknown as typeof fetch;
const codes = (report: ProductReport) => report.warnings.map((warning) => warning.code);

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('unexpected network call'); }));
});
afterEach(() => vi.unstubAllGlobals());

describe('identifier parsing', () => {
  it('pads a GTIN-13 to 14 digits and treats it as product-level', () => {
    expect(parseIdentifier('4006381333931')).toMatchObject({ gtin: '04006381333931', level: 'PRODUCT', serial: null });
  });

  it('rejects a bad check digit and unrecognized text', () => {
    expect(validGtin('4006381333932')).toBe(false);
    expect(parseIdentifier('4006381333932')).toBeNull();
    expect(parseIdentifier('https://evil.test/login')).toBeNull();
    expect(parseIdentifier('hello')).toBeNull();
    expect(parseIdentifier('x'.repeat(300))).toBeNull();
  });

  it('reads bracketed, raw and Digital Link forms alike', () => {
    const expected = { gtin: GTINS.demozol500, batchNumber: 'DX2041', serial: 'SN1', level: 'PACK' };
    expect(parseIdentifier(gs1(GTINS.demozol500, '(10)DX2041', '(21)SN1'))).toMatchObject(expected);
    expect(parseIdentifier(`]d201${GTINS.demozol500}10DX2041\u001d21SN1`)).toMatchObject(expected);
    expect(parseIdentifier(`https://id.example/01/${GTINS.demozol500}/10/DX2041/21/SN1`)).toMatchObject(expected);
  });

  it('reads an expiry, including a code with no day', () => {
    expect(parseIdentifier(gs1(GTINS.demozol500, '(17)280131'))?.expiryDate).toBe('2028-01-31');
    expect(parseIdentifier(gs1(GTINS.demozol500, '(17)280100'))?.expiryDate).toBe('2028-01');
  });

  it('calls a batch code batch-level, not pack-level', () => {
    expect(parseIdentifier(gs1(GTINS.demozol500, '(10)DX2041'))?.level).toBe('BATCH');
  });
});

describe('product resolution', () => {
  it('resolves a known GTIN as product-level, with no scan signal', async () => {
    const scans = memoryScanStore();
    const report = await resolve(GTINS.demozol250, undefined, scans);
    await resolve(GTINS.demozol250, undefined, scans);
    expect(report).toMatchObject({ outcome: 'RESOLVED', identityLevel: 'PRODUCT', pack: null, batch: null, scanSignal: null, physicalAuthenticityConfirmed: false });
    expect(report.product?.packSize).toBe('20 tablets');
    expect(report.product?.productName).toBe('Demozol 250 mg Tablets');
    expect(report.explanation).toContain('not one physical pack');
  });

  it('reports an unknown GTIN as not found, and not as fake', async () => {
    const report = await resolve(GTINS.unlisted);
    expect(report.outcome).toBe('NOT_FOUND');
    expect(report.explanation).toContain('not evidence of counterfeiting');
  });

  it('resolves a serialized pack with batch, status and history', async () => {
    const scans = memoryScanStore();
    const first = await resolve(gs1(GTINS.demozol500, '(21)DEMOSN0001'), undefined, scans, 'device-one');
    const second = await resolve(gs1(GTINS.demozol500, '(21)DEMOSN0001'), undefined, scans, 'device-two');
    expect(first).toMatchObject({ identityLevel: 'PACK', pack: { status: 'ACTIVE', batchNumber: 'DX2041' }, batch: { status: 'ACTIVE' } });
    expect(second.scanSignal).toMatchObject({ totalScans: 2, distinctDevices: 2 });
    expect(codes(second)).toEqual([]);
  });

  it('does not count scans of a serial the source does not know', async () => {
    const report = await resolve(gs1(GTINS.demozol500, '(21)NOSUCH'));
    expect(report.outcome).toBe('RESOLVED');
    expect(codes(report)).toContain('SERIAL_NOT_FOUND');
    expect(report.scanSignal).toBeNull();
  });

  it('still reports the pack when scan history fails', async () => {
    const report = await resolve(gs1(GTINS.demozol500, '(21)DEMOSN0001'), undefined, { record: async () => { throw new Error('down'); } });
    expect(report.outcome).toBe('RESOLVED');
    expect(codes(report)).toContain('SCAN_HISTORY_UNAVAILABLE');
  });

  it('never invents a batch when none is indexed', async () => {
    const report = await resolve(gs1(GTINS.demozol250, '(10)NOPE'));
    expect(report.batch).toBeNull();
    expect(codes(report)).toContain('BATCH_DATA_UNAVAILABLE');
  });

  it('reports a recalled and a blocked batch from the record', async () => {
    expect(codes(await resolve(gs1(GTINS.demozol500, '(10)DX2042')))).toContain('BATCH_RECALLED');
    expect(codes(await resolve(gs1(GTINS.examplin, '(10)EX5001')))).toContain('BATCH_BLOCKED');
    expect(codes(await resolve(gs1(GTINS.demozol500, '(21)DEMOSN0003')))).toEqual(expect.arrayContaining(['PACK_BLOCKED', 'BATCH_RECALLED']));
  });

  it('flags an expired batch and an unknown status, without calling either fake', async () => {
    expect(codes(await resolve(gs1(GTINS.demozol500, '(10)DX1999')))).toContain('BATCH_EXPIRED');
    expect(codes(await resolve(gs1(GTINS.placebrin, '(10)PB7731')))).toContain('BATCH_STATUS_UNKNOWN');
  });

  it('flags a code that disagrees with the records', async () => {
    expect(codes(await resolve(gs1(GTINS.demozol500, '(10)DX1999', '(21)DEMOSN0001')))).toContain('BATCH_DIFFERS_FROM_PACK_RECORD');
    expect(codes(await resolve(gs1(GTINS.demozol500, '(17)290101', '(10)DX2041')))).toContain('EXPIRY_DIFFERS_FROM_BATCH_RECORD');
  });

  it('handles an incomplete record safely, and names what is missing', async () => {
    const report = await resolve(GTINS.placebrinJunior);
    expect(report.outcome).toBe('RESOLVED');
    expect(report.product).toMatchObject({ manufacturer: null, strength: null, nafdacNumber: null });
    expect(report.sources[0]?.unavailableFields).toEqual(expect.arrayContaining(['manufacturer', 'strength', 'nafdacNumber', 'ingredients']));
    expect(report.registrationReference).toBeNull();
  });

  it('marks a pack with no lot or state as unknown', async () => {
    const report = await resolve(gs1(GTINS.examplin, '(21)DEMOSN1002'));
    expect(report.pack).toMatchObject({ status: 'UNKNOWN', batchNumber: null });
  });

  it('keeps the registration reference as its own source', async () => {
    const report = await resolve(GTINS.demozol500);
    expect(report.sources.map((source) => source.sourceType)).toEqual(['SIMULATED_ERP', 'DEMO_REFERENCE_FIXTURE']);
    expect(report.registrationReference?.nafdacNumber).toBe('DEMO-0101');
  });

  it('rejects an unreadable identifier without calling a source', async () => {
    const send = vi.fn() as unknown as typeof fetch;
    const report = await resolve('not a barcode', send);
    expect(report.outcome).toBe('INVALID_IDENTIFIER');
    expect(send).not.toHaveBeenCalled();
  });
});

describe('source failures and provenance', () => {
  it('reports a timeout as unavailable, never as not found', async () => {
    const hang = ((_input: RequestInfo | URL, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    })) as typeof fetch;
    const report = await resolve(GTINS.demozol500, hang);
    expect(report.outcome).toBe('SOURCE_UNAVAILABLE');
    expect(report.sources[0]?.retrievalStatus).toBe('UNAVAILABLE');
  });

  it.each([
    ['a refused connection', down],
    ['a server error', (async () => new Response('x', { status: 500 })) as unknown as typeof fetch],
    ['a redirect', (async () => new Response(null, { status: 302 })) as unknown as typeof fetch],
    ['bad JSON', (async () => new Response('<html>')) as unknown as typeof fetch],
    ['a wrong shape', (async () => Response.json({ fictional: true, data: { gtin: 1 } })) as unknown as typeof fetch],
  ])('reports %s as unavailable', async (_name, send) => {
    expect((await resolve(GTINS.demozol500, send)).outcome).toBe('SOURCE_UNAVAILABLE');
  });

  it('reports no connected source without calling anything', async () => {
    const report = await resolveIdentifier(GTINS.demozol500, { connectors: [], referenceFor: () => createDemoSource(), scans: null });
    expect(report.outcome).toBe('SOURCE_UNAVAILABLE');
    expect(report.sources[0]).toMatchObject({ sourceType: 'NONE', retrievalStatus: 'NOT_ATTEMPTED' });
  });

  it('reports an operation the ERP does not support', async () => {
    const send = (async () => new Response(null, { status: 501 })) as unknown as typeof fetch;
    expect((await connector(send).getPack(GTINS.demozol500, 'X')).status).toBe('UNSUPPORTED');
  });

  it('identifies source, status, time, freshness and demo state', async () => {
    const { provenance } = await connector().getProduct(GTINS.demozol500);
    expect(provenance).toEqual({
      sourceType: 'SIMULATED_ERP', sourceName: 'Test ERP', retrievalStatus: 'RETRIEVED',
      retrievedAt: NOW.toISOString(), dataAsOf: '2026-10-31T00:00:00.000Z', isDemo: true, unavailableFields: [],
    });
  });

  it('refuses fictional data from a source configured as a real manufacturer', async () => {
    const result = await connector(erpFetch, 'MANUFACTURER_API').getProduct(GTINS.demozol500);
    expect(result.status).toBe('SOURCE_UNAVAILABLE');
    expect(result.provenance.isDemo).toBe(false);
  });

  it('refuses data not marked fictional from a simulated source', async () => {
    const real = (async () => Response.json({ data: {} })) as unknown as typeof fetch;
    expect((await connector(real).getProduct(GTINS.demozol500)).status).toBe('SOURCE_UNAVAILABLE');
  });

  it('chooses a connector by GTIN prefix', () => {
    const a = { ...connector(), gtinPrefixes: ['0200'] };
    const b = { ...connector(), gtinPrefixes: ['0615'] };
    expect(connectorFor([a, b], '06150000000001')).toBe(b);
    expect(connectorFor([a, b], '09990000000001')).toBeNull();
  });
});

describe('scan signals', () => {
  it('caps stored devices, and accepts scans with no device', () => {
    let state = nextScanState(undefined, null, 'a');
    for (let index = 0; index < MAX_DEVICES + 5; index += 1) state = nextScanState(state, `device-${index}`, 'b');
    expect(state.distinctDevices).toBe(MAX_DEVICES);
    expect(state.totalScans).toBe(MAX_DEVICES + 6);
    expect(state.firstSeenAt).toBe('a');
  });

  it('reports facts only, with no verdict', async () => {
    const scans = memoryScanStore();
    let report = await resolve(gs1(GTINS.demozol500, '(21)DEMOSN0002'), undefined, scans);
    for (let index = 0; index < 20; index += 1) report = await resolve(gs1(GTINS.demozol500, '(21)DEMOSN0002'), undefined, scans);
    expect(Object.keys(report.scanSignal ?? {}).sort()).toEqual(['distinctDevices', 'firstSeenAt', 'lastSeenAt', 'totalScans']);
    expect(report.warnings).toEqual([]);
  });
});

function packaging(values: Partial<Record<FieldName, string>>): Extraction {
  const fields = Object.fromEntries(FIELD_NAMES.map((name) => {
    const value = values[name] ?? null;
    return [name, { value, evidence: value, legibility: value ? 'CLEAR' : 'NOT_VISIBLE' }];
  }));
  return extractionSchema.parse({
    category: 'medicine', imageQuality: 'GOOD', fields, activeIngredients: [], otherClaims: [],
    missingFields: [], uncertainFields: [],
  });
}

describe('packaging comparison with the ERP', () => {
  const pack = { productName: 'Demozol', strength: '500 mg', nafdacNumber: 'DEMO-0101', dosageForm: 'Tablets' };

  it('reports a match without confirming the physical pack', async () => {
    const result = await comparePackagingWithErp(packaging(pack), GTINS.demozol500, [connector()]);
    expect(result).toMatchObject({ status: 'REGISTRATION_DETAILS_MATCH', physicalAuthenticityConfirmed: false });
    expect(result.sources[0]?.sourceType).toBe('SIMULATED_ERP');
  });

  it('reports a product mismatch', async () => {
    const result = await comparePackagingWithErp(packaging({ ...pack, strength: '250 mg' }), GTINS.demozol500, [connector()]);
    expect(result.status).toBe('DETAILS_MISMATCH');
    expect(result.findings.find((finding) => finding.field === 'strength')?.status).toBe('MISMATCH');
  });

  it('does not invent a mismatch where the record has no number', async () => {
    const result = await comparePackagingWithErp(packaging({ productName: 'Coughex', nafdacNumber: 'DEMO-9999' }), GTINS.coughex, [connector()]);
    expect(result.findings.find((finding) => finding.field === 'nafdacNumber')?.status).toBe('UNKNOWN');
  });

  it('notes a recalled batch printed on the pack, and an unknown one', async () => {
    const recalled = await comparePackagingWithErp(packaging({ ...pack, batchNumber: 'DX2042' }), GTINS.demozol500, [connector()]);
    expect(recalled.packagingNotes.map((note) => note.code)).toContain('PRINTED_BATCH_RECALLED');
    const unknown = await comparePackagingWithErp(packaging({ ...pack, batchNumber: 'ZZ' }), GTINS.demozol500, [connector()]);
    expect(unknown.packagingNotes.map((note) => note.code)).toContain('PRINTED_BATCH_NOT_IN_RECORD');
  });

  it('reports an unavailable source and an unknown product honestly', async () => {
    expect((await comparePackagingWithErp(packaging(pack), GTINS.demozol500, [connector(down)])).status).toBe('REFERENCE_UNAVAILABLE');
    expect((await comparePackagingWithErp(packaging(pack), GTINS.unlisted, [connector()])).status).toBe('RECORD_NOT_FOUND');
  });
});

describe('service routes', () => {
  const env: Env = { AI_SERVICE_TOKEN: 'service', ERP_MODE: 'demo', ERP_BASE_URL: 'https://erp.test', ERP_API_TOKEN: TOKEN };
  const overrides: Overrides = { erpFetch, scans: memoryScanStore(), now: () => NOW };
  const headers = { Authorization: 'Bearer service', 'Content-Type': 'application/json' };
  const post = (path: string, body: unknown) => new Request(`https://ai.test${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const get = (path: string) => new Request(`https://ai.test${path}`, { headers });

  it('resolves through the route', async () => {
    const response = await handleRequest(post('/resolve-identifier', { identifier: GTINS.demozol500 }), env, overrides);
    expect(await response.json()).toMatchObject({ outcome: 'RESOLVED', identityLevel: 'PRODUCT' });
  });

  it('serves product, batch, pack and status reads', async () => {
    const body = async (path: string) => (await handleRequest(get(path), env, overrides)).json();
    expect(await body(`/products/${GTINS.demozol500}`)).toMatchObject({ status: 'FOUND', data: { manufacturer: 'Fictional Labs Nigeria Ltd' } });
    expect(await body(`/products/${GTINS.demozol500}/batches/DX2042`)).toMatchObject({ data: { status: 'RECALLED' } });
    expect(await body(`/products/${GTINS.demozol500}/packs/DEMOSN0001`)).toMatchObject({ data: { status: 'ACTIVE' } });
    expect(await body('/source-status')).toMatchObject({ sources: [{ available: true, capabilities: { packs: true } }] });
  });

  it('records no scan event on a read', async () => {
    const scans = { record: vi.fn() };
    await handleRequest(get(`/products/${GTINS.demozol500}/packs/DEMOSN0001`), env, { ...overrides, scans });
    expect(scans.record).not.toHaveBeenCalled();
  });

  it('requires the service token', async () => {
    const response = await handleRequest(new Request(`https://ai.test/products/${GTINS.demozol500}`), env, overrides);
    expect(response.status).toBe(401);
  });

  it('connects nothing on an unknown ERP mode, rather than serving fixtures', async () => {
    const response = await handleRequest(post('/resolve-identifier', { identifier: GTINS.demozol500 }), { ...env, ERP_MODE: 'demoo' }, overrides);
    expect(await response.json()).toMatchObject({ outcome: 'SOURCE_UNAVAILABLE' });
  });

  it('never sends a simulated product to a live registry', async () => {
    const send = vi.fn() as unknown as typeof fetch;
    const live = { ...overrides, source: { fetch: send } };
    const response = await handleRequest(post('/resolve-identifier', { identifier: GTINS.demozol500 }), { ...env, REFERENCE_MODE: 'authorized_live', GREENBOOK_ACCESS_BASIS: 'test' }, live);
    expect(await response.json()).toMatchObject({ registrationReference: { nafdacNumber: 'DEMO-0101' } });
    expect(send).not.toHaveBeenCalled();
  });

  it('rejects a malformed request', async () => {
    expect((await handleRequest(post('/resolve-identifier', { code: 'x' }), env, overrides)).status).toBe(400);
    expect((await handleRequest(get('/products/123'), env, overrides)).status).toBe(400);
  });
});
