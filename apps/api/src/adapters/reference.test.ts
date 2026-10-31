import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isReferenceLookupResult } from '../routes/reference';
import { analyzeRequest } from '../routes/analyze';
import { createDependencies } from '../app';
import { createGreenbookAdapter, createGreenbookState, GREENBOOK_URL, toGreenbookQuery } from './greenbook';
import { createReferenceAdapter } from './reference';

const NOW = new Date('2026-10-31T10:00:00.000Z');
const ISO = NOW.toISOString();

// Captured from the real site on 2026-10-31, with internal ids and timestamps removed.
const A6_100103 = {
  product_id: 7078,
  product_name: 'Recombinant Hepatitis B Vaccine 0.5 mL (Pediatric)**',
  strength: '10 mcg/0.5 mL',
  NAFDAC: 'A6-100103',
  approval_date: '2023-06-04',
  expiry_date: '2028-05-30',
  pack_size: '0.5 mL x 10&#039;s (in Pre-filled syringes)',
  status: 'Active',
  ingredient: { ingredient_id: 924, ingredient_name: 'Hepatitis B vaccine', synonym: '' },
  applicant: { id: 1225, name: 'Biovaccines Nigeria Ltd', address: null },
  ingredient_name: 'Hepatitis B vaccine',
  applicant_name: 'Biovaccines Nigeria Ltd',
};

function page(data: unknown[], overrides: Record<string, unknown> = {}) {
  return { draw: 1, recordsTotal: 8966, recordsFiltered: data.length, data, ...overrides };
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function adapterReturning(response: Response | Promise<Response>) {
  const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => response);
  const adapter = createGreenbookAdapter({
    fetch: fetchMock,
    now: () => NOW,
    state: createGreenbookState(),
  });
  return { adapter, fetchMock };
}

const liveAttempted = {
  source: 'NAFDAC_GREENBOOK', mode: 'LIVE_OFFICIAL', authoritative: false, requestedAt: ISO, sourceUrl: GREENBOOK_URL,
};
const notRun = { source: 'NONE', mode: 'NOT_EXECUTED', authoritative: false, requestedAt: null };

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Greenbook exact match', () => {
  it('normalizes the record captured for A6-100103 into the shared contract', async () => {
    const { adapter, fetchMock } = adapterReturning(jsonResponse(page([A6_100103], { queries: [{ query: 'select 1' }] })));

    const result = await adapter.lookupMedicine('a6 – 100103');

    expect(result).toEqual({
      status: 'FOUND',
      record: {
        productName: 'Recombinant Hepatitis B Vaccine 0.5 mL (Pediatric)',
        nafdacNumber: 'A6-100103',
        manufacturer: null,
        strength: '10 mcg/0.5 mL',
        ingredients: ['Hepatitis B vaccine'],
        registrationExpiry: '2028-05-30',
        retrievedAt: ISO,
        applicant: 'Biovaccines Nigeria Ltd',
        packSize: "0.5 mL x 10's (in Pre-filled syringes)",
        registrationStatus: 'Active',
        productCategory: null,
        dosageForm: null,
        route: null,
        approvalDate: '2023-06-04',
      },
      provenance: {
        source: 'NAFDAC_GREENBOOK', mode: 'LIVE_OFFICIAL', authoritative: true, requestedAt: ISO, sourceUrl: GREENBOOK_URL,
      },
    });
    expect(isReferenceLookupResult(result)).toBe(true);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(new URL(String(url)).searchParams.get('search[value]')).toBe('A6-100103');
    const headers = new Headers(init?.headers);
    expect(headers.get('Cookie')).toBeNull();
    expect(headers.get('User-Agent')).toContain('CounterfeitIQ');
  });

  it.each(['A6-100103', 'a6-100103', ' A6 - 100103 ', 'A6–100103', 'NAFDAC No: A6-100103'])(
    'matches %j against the same stored number',
    async (requested) => {
      const { adapter } = adapterReturning(jsonResponse(page([A6_100103])));
      expect((await adapter.lookupMedicine(requested)).status).toBe('FOUND');
    },
  );

  it.each(['a6-100103', 'A6 100103', 'A6 - 100103'])('matches a record stored as %j', async (stored) => {
    const { adapter } = adapterReturning(jsonResponse(page([{ ...A6_100103, NAFDAC: stored }])));
    expect((await adapter.lookupMedicine('A6-100103')).status).toBe('FOUND');
  });

  it('picks the exact record, not the first one', async () => {
    const { adapter } = adapterReturning(jsonResponse(page([
      { ...A6_100103, NAFDAC: 'A6-1001039', product_name: 'Other Product' },
      A6_100103,
    ])));
    const result = await adapter.lookupMedicine('A6-100103');
    expect(result.status === 'FOUND' && result.record.nafdacNumber).toBe('A6-100103');
  });

  it('carries an inactive registration in the note', async () => {
    const { adapter } = adapterReturning(jsonResponse(page([{ ...A6_100103, status: 'Inactive' }])));
    const result = await adapter.lookupMedicine('A6-100103');
    expect(result.status).toBe('FOUND');
    expect(result.provenance.note).toContain('does not list this registration as active');
  });

  it('accepts identical duplicates but refuses to choose between conflicting records', async () => {
    const same = adapterReturning(jsonResponse(page([A6_100103, { ...A6_100103, product_id: 2 }])));
    expect((await same.adapter.lookupMedicine('A6-100103')).status).toBe('FOUND');

    const conflict = adapterReturning(jsonResponse(page([A6_100103, { ...A6_100103, strength: '20 mcg/1 mL' }])));
    const result = await conflict.adapter.lookupMedicine('A6-100103');
    expect(result).toMatchObject({ status: 'SOURCE_UNAVAILABLE', provenance: liveAttempted });
  });
});

describe('Greenbook misses', () => {
  it.each(['A6-1001039', 'A6-10010', 'B6-100103', 'XA6-100103'])('rejects the similar number %s', async (near) => {
    const { adapter } = adapterReturning(jsonResponse(page([{ ...A6_100103, NAFDAC: near }])));
    const result = await adapter.lookupMedicine('A6-100103');
    expect(result).toMatchObject({ status: 'NOT_FOUND', record: null });
    expect(isReferenceLookupResult(result)).toBe(true);
  });

  it('reports a genuine live NOT_FOUND with full provenance', async () => {
    const { adapter } = adapterReturning(jsonResponse(page([])));
    const result = await adapter.lookupMedicine('A6-999999');
    expect(result).toEqual({
      status: 'NOT_FOUND',
      record: null,
      provenance: {
        source: 'NAFDAC_GREENBOOK', mode: 'LIVE_OFFICIAL', authoritative: true, requestedAt: ISO, sourceUrl: GREENBOOK_URL,
      },
    });
    expect(isReferenceLookupResult(result)).toBe(true);
  });

  it('does not claim a miss when more results exist than were received', async () => {
    const near = { ...A6_100103, NAFDAC: 'A6-1001039' };
    const { adapter } = adapterReturning(jsonResponse(page([near], { recordsFiltered: 120 })));
    expect(await adapter.lookupMedicine('A6-100103')).toMatchObject({ status: 'SOURCE_UNAVAILABLE', provenance: liveAttempted });
  });
});

describe('Greenbook failures are SOURCE_UNAVAILABLE, never NOT_FOUND', () => {
  it('reports a timeout', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    const adapter = createGreenbookAdapter({ fetch: fetchMock, state: createGreenbookState() });

    const pending = adapter.lookupMedicine('A6-100103');
    await vi.advanceTimersByTimeAsync(8_001);
    const result = await pending;

    expect(result).toMatchObject({ status: 'SOURCE_UNAVAILABLE', provenance: liveAttempted });
    expect(result.provenance.note).toContain('in time');
    expect(isReferenceLookupResult(result)).toBe(true);
  });

  it('reports a network failure without leaking its detail', async () => {
    const { adapter } = adapterReturning(Promise.reject(new Error('connect ECONNREFUSED 10.0.0.1')));
    const result = await adapter.lookupMedicine('A6-100103');
    expect(result).toMatchObject({ status: 'SOURCE_UNAVAILABLE', provenance: liveAttempted });
    expect(JSON.stringify(result)).not.toContain('ECONNREFUSED');
  });

  it.each([
    ['server error', 500], ['forbidden', 403], ['not found', 404], ['redirect', 302], ['bad gateway', 502],
  ])('reports HTTP %s', async (_label, status) => {
    const { adapter } = adapterReturning(new Response(null, { status }));
    expect(await adapter.lookupMedicine('A6-100103')).toMatchObject({ status: 'SOURCE_UNAVAILABLE', provenance: liveAttempted });
  });

  it('honours a 429 and sends nothing more until the wait is over', async () => {
    let time = NOW.getTime();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => new Response(null, { status: 429, headers: { 'Retry-After': '120' } }));
    const adapter = createGreenbookAdapter({ fetch: fetchMock, now: () => new Date(time), state: createGreenbookState() });

    expect(await adapter.lookupMedicine('A6-100103')).toMatchObject({ status: 'SOURCE_UNAVAILABLE', provenance: liveAttempted });

    time += 119_000;
    expect(await adapter.lookupMedicine('A6-100103')).toMatchObject({ status: 'SOURCE_UNAVAILABLE', provenance: notRun });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    time += 2_000;
    await adapter.lookupMedicine('A6-100103');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('backs off after an unavailable service', async () => {
    const { adapter, fetchMock } = adapterReturning(new Response(null, { status: 503 }));
    await adapter.lookupMedicine('A6-100103');
    expect(await adapter.lookupMedicine('A6-100103')).toMatchObject({ provenance: notRun });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each<[string, unknown]>([
    ['a DataTables error with an empty result', { draw: 1, recordsTotal: 0, recordsFiltered: 0, data: [], error: 'Exception Message: SQLSTATE' }],
    ['an error alongside an empty result and a real total', page([], { error: 'failed' })],
    ['an empty registry', page([], { recordsTotal: 0 })],
    ['missing data', { draw: 1, recordsTotal: 1, recordsFiltered: 0 }],
    ['data that is not an array', page([], { data: {} })],
    ['rows that are not objects', page([], { data: ['A6-100103'], recordsFiltered: 1 })],
    ['missing recordsFiltered', page([], { recordsFiltered: undefined })],
    ['counts that are strings', page([], { recordsTotal: '8966' })],
    ['a filtered count with no rows', page([], { recordsFiltered: 3 })],
    ['more rows than the filtered count', page([A6_100103], { recordsFiltered: 0 })],
    ['a mismatched draw', page([], { draw: 2 })],
    ['a row with no number', page([{ ...A6_100103, NAFDAC: null }])],
    ['a null body', null],
    ['an array body', []],
  ])('reports %s', async (_label, body) => {
    const { adapter } = adapterReturning(jsonResponse(body));
    const result = await adapter.lookupMedicine('A6-100103');
    expect(result).toMatchObject({ status: 'SOURCE_UNAVAILABLE', record: null, provenance: liveAttempted });
    expect(isReferenceLookupResult(result)).toBe(true);
  });

  it('reports an exact match with no product name', async () => {
    const { adapter } = adapterReturning(jsonResponse(page([{ ...A6_100103, product_name: '**' }])));
    expect(await adapter.lookupMedicine('A6-100103')).toMatchObject({ status: 'SOURCE_UNAVAILABLE', provenance: liveAttempted });
  });

  it('reports an HTML page served with a 200', async () => {
    const { adapter } = adapterReturning(new Response('<html>Maintenance</html>', { headers: { 'Content-Type': 'text/html' } }));
    expect(await adapter.lookupMedicine('A6-100103')).toMatchObject({ status: 'SOURCE_UNAVAILABLE', provenance: liveAttempted });
  });

  it('reports a body that is not JSON', async () => {
    const { adapter } = adapterReturning(new Response('{"data":[', { headers: { 'Content-Type': 'application/json' } }));
    expect(await adapter.lookupMedicine('A6-100103')).toMatchObject({ status: 'SOURCE_UNAVAILABLE', provenance: liveAttempted });
  });
});

describe('Greenbook request limits', () => {
  it('serves repeat lookups from the cache with the original timestamp', async () => {
    let time = NOW.getTime();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => jsonResponse(page([A6_100103])));
    const adapter = createGreenbookAdapter({ fetch: fetchMock, now: () => new Date(time), state: createGreenbookState() });

    await adapter.lookupMedicine('A6-100103');
    time += 60 * 60 * 1000;
    const cached = await adapter.lookupMedicine('a6-100103');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(cached.provenance.requestedAt).toBe(ISO);

    time += 6 * 60 * 60 * 1000;
    await adapter.lookupMedicine('A6-100103');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('never caches a failure', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockRejectedValueOnce(new Error('down'))
      .mockImplementation(async () => jsonResponse(page([A6_100103])));
    const adapter = createGreenbookAdapter({ fetch: fetchMock, now: () => NOW, state: createGreenbookState() });

    expect((await adapter.lookupMedicine('A6-100103')).status).toBe('SOURCE_UNAVAILABLE');
    expect((await adapter.lookupMedicine('A6-100103')).status).toBe('FOUND');
  });

  it('stops sending after the per-minute budget', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => jsonResponse(page([])));
    const adapter = createGreenbookAdapter({ fetch: fetchMock, now: () => NOW, state: createGreenbookState() });

    for (let index = 0; index < 30; index += 1) await adapter.lookupMedicine(`A6-${100000 + index}`);
    expect(await adapter.lookupMedicine('A6-200000')).toMatchObject({ status: 'SOURCE_UNAVAILABLE', provenance: notRun });
    expect(fetchMock).toHaveBeenCalledTimes(30);
  });

  it('fails closed when the rate limit binding refuses or breaks', async () => {
    for (const limit of [
      vi.fn().mockResolvedValue({ success: false }),
      vi.fn().mockRejectedValue(new Error('binding error')),
    ]) {
      const fetchMock = vi.fn<typeof fetch>();
      const adapter = createGreenbookAdapter({ fetch: fetchMock, limiter: { limit }, state: createGreenbookState() });
      expect(await adapter.lookupMedicine('A6-100103')).toMatchObject({ provenance: notRun });
      expect(fetchMock).not.toHaveBeenCalled();
    }
  });
});

describe('lookups that must not run', () => {
  it.each(['', '   ', '???', 'A6100103', '100103', 'A6-100103 BATCH 77'])('does not query for %j', async (number) => {
    const { adapter, fetchMock } = adapterReturning(jsonResponse(page([])));
    const result = await adapter.lookupMedicine(number);
    expect(result).toMatchObject({ status: 'SOURCE_UNAVAILABLE', record: null, provenance: notRun });
    expect(isReferenceLookupResult(result)).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['A6-100103', 'A6-100103'],
    ['NAFDAC REG. NO: 04-2911', '04-2911'],
    ['Reg No: A4-1234', 'A4-1234'],
    ['04 2911', '04-2911'],
    ['A6 – 100103', 'A6-100103'],
  ])('reads %j as %s', (input, expected) => {
    expect(toGreenbookQuery(input)).toBe(expected);
  });

  it.each([
    ['a non-medicine', { category: 'food', nafdacNumber: 'A6-100103' }],
    ['a medicine with no number', { category: 'medicine', nafdacNumber: null }],
    ['a medicine with a blank number', { category: 'medicine', nafdacNumber: '  ' }],
  ])('makes no Greenbook request for %s', async (_label, product) => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);
    const dependencies = createDependencies({ REFERENCE_MODE: 'authorized_live', GREENBOOK_ACCESS_BASIS: 'test' });
    dependencies.extractProduct = async () => ({
      productName: 'Pack', brand: null, manufacturer: null, strength: null, ingredients: [],
      batchNumber: null, manufacturingDate: null, expiryDate: null, ...product,
    });

    const form = new FormData();
    form.set('image', new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2])], 'pack.jpg', { type: 'image/jpeg' }));
    const response = await analyzeRequest(
      new Request('https://example.test/api/analyze', { method: 'POST', body: form }),
      dependencies,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ reference: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('Greenbook record details', () => {
  const row = { ...A6_100103, strength: 'NA', atc: 'J07BC01', composition: 'HBsAg 10 mcg', product_id: 7078 };
  const pageHtml = '<h1 class="x">Manufacturer Name\n</h1>\n<p class="m-2">\n Example Maker Ltd\n</p><h1>Manufacturer Country</h1><p>NIGERIA &nbsp;</p><h1>Marketing Category</h1><p>NA &nbsp;</p>';

  function adapter(productPage: () => Promise<Response>, readProductPage = true) {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (url) => (
      String(url).includes('/products/details/') ? productPage() : jsonResponse(page([row]))
    ));
    return { fetchMock, adapter: createGreenbookAdapter({ fetch: fetchMock, readProductPage, state: createGreenbookState() }) };
  }

  it('treats the text NA as missing, so it is never compared', async () => {
    const { adapter: greenbook } = adapter(async () => new Response('', { status: 404 }));
    const result = await greenbook.lookupMedicine('A6-100103');
    expect(result.record?.strength).toBeNull();
    expect(result.record?.composition).toBe('HBsAg 10 mcg');
    expect(result.record?.atcCode).toBe('J07BC01');
  });

  it('adds the manufacturer from the product page without using it for comparison', async () => {
    const { adapter: greenbook, fetchMock } = adapter(async () => new Response(pageHtml, { headers: { 'Content-Type': 'text/html' } }));
    const result = await greenbook.lookupMedicine('A6-100103');
    expect(result.status).toBe('FOUND');
    expect(result.record).toMatchObject({ manufacturer: null, listedManufacturer: 'Example Maker Ltd', manufacturerCountry: 'NIGERIA' });
    expect(result.record?.marketingCategory).toBeUndefined();
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('/products/details/7078');
  });

  it.each([
    ['a server error', async () => new Response('oops', { status: 500 })],
    ['a network failure', async () => { throw new TypeError('network'); }],
    ['an unexpected page', async () => new Response('{}', { headers: { 'Content-Type': 'application/json' } })],
  ])('keeps the verified result when the product page gives %s', async (_name, productPage) => {
    const { adapter: greenbook } = adapter(productPage as () => Promise<Response>);
    const result = await greenbook.lookupMedicine('A6-100103');
    expect(result.status).toBe('FOUND');
    expect(result.provenance).toMatchObject({ mode: 'LIVE_OFFICIAL', authoritative: true });
    expect(result.record?.listedManufacturer).toBeUndefined();
  });

  it('does not read the product page unless asked', async () => {
    const { adapter: greenbook, fetchMock } = adapter(async () => new Response(pageHtml), false);
    await greenbook.lookupMedicine('A6-100103');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not read a product page for a miss', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => jsonResponse(page([])));
    const greenbook = createGreenbookAdapter({ fetch: fetchMock, readProductPage: true, state: createGreenbookState() });
    await greenbook.lookupMedicine('A6-100103');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('provider selection', () => {
  it('defaults to fixtures and contacts nobody', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);

    for (const adapter of [createReferenceAdapter(), createReferenceAdapter({ mode: ' Demo ' })]) {
      const found = await adapter.lookupMedicine('A1-123456');
      expect(found).toMatchObject({
        status: 'FOUND',
        provenance: { source: 'DEMO_FIXTURE', mode: 'DEMO_FIXTURE', authoritative: false },
      });
      expect(isReferenceLookupResult(found)).toBe(true);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never turns a fixture miss into an official NOT_FOUND', async () => {
    const result = await createReferenceAdapter({ now: () => NOW }).lookupMedicine('A6-999999');
    expect(result).toEqual({
      status: 'SOURCE_UNAVAILABLE',
      record: null,
      provenance: {
        source: 'DEMO_FIXTURE', mode: 'DEMO_FIXTURE', authoritative: false, requestedAt: ISO,
        note: 'Demonstration mode: this number was not checked against NAFDAC.',
      },
    });
    expect(isReferenceLookupResult(result)).toBe(true);
  });

  it('reports a missing number to the fixture as not executed', async () => {
    expect(await createReferenceAdapter().lookupMedicine('  ')).toMatchObject({ provenance: notRun });
  });

  it.each([undefined, '', '   '])('sends nothing to the Greenbook without an access approval (%j)', async (approval) => {
    const fetchMock = vi.fn<typeof fetch>();
    const adapter = createReferenceAdapter({
      mode: 'authorized_live',
      greenbookAccessBasis: approval,
      greenbook: { fetch: fetchMock, state: createGreenbookState() },
    });
    expect(await adapter.lookupMedicine('A6-100103')).toMatchObject({ status: 'SOURCE_UNAVAILABLE', provenance: notRun });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses the Greenbook once access is approved', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => jsonResponse(page([A6_100103])));
    const adapter = createReferenceAdapter({
      mode: 'authorized_live',
      greenbookAccessBasis: 'NAFDAC email, 2026-11-02',
      greenbook: { fetch: fetchMock, now: () => NOW, state: createGreenbookState() },
    });
    expect(await adapter.lookupMedicine('A6-100103')).toMatchObject({
      status: 'FOUND',
      provenance: { source: 'NAFDAC_GREENBOOK', mode: 'LIVE_OFFICIAL', authoritative: true },
    });
  });

  it.each([
    ['a timeout', () => Promise.reject(new DOMException('Aborted', 'AbortError'))],
    ['a server error', async () => new Response('down', { status: 500 })],
    ['a valid miss', async () => jsonResponse(page([]))],
  ])('never answers from fixtures after %s in live mode', async (_name, respond) => {
    const adapter = createReferenceAdapter({
      mode: 'authorized_live',
      greenbookAccessBasis: 'test',
      greenbook: { fetch: vi.fn<typeof fetch>().mockImplementation(respond), now: () => NOW, state: createGreenbookState() },
    });
    const result = await adapter.lookupMedicine('A1-123456');
    expect(result.record).toBeNull();
    expect(result.provenance.source).toBe('NAFDAC_GREENBOOK');
  });

  it('gives the route the same contract in both modes', async () => {
    const demo = await createReferenceAdapter({ mode: 'demo' }).lookupMedicine('A1-123456');
    const live = await createReferenceAdapter({
      mode: 'authorized_live',
      greenbookAccessBasis: 'test',
      greenbook: {
        fetch: vi.fn<typeof fetch>().mockImplementation(async () => jsonResponse(page([A6_100103]))),
        state: createGreenbookState(),
      },
    }).lookupMedicine('A6-100103');
    for (const result of [demo, live]) {
      expect(isReferenceLookupResult(result)).toBe(true);
      expect(Object.keys(result.record ?? {})).toEqual(expect.arrayContaining([
        'ingredients', 'manufacturer', 'nafdacNumber', 'productName', 'registrationExpiry', 'retrievedAt', 'strength',
      ]));
    }
  });

  it('fails closed on an unknown mode instead of serving fixtures', async () => {
    const result = await createReferenceAdapter({ mode: 'authorised_live' }).lookupMedicine('A1-123456');
    expect(result).toMatchObject({ status: 'SOURCE_UNAVAILABLE', provenance: notRun });
  });
});
