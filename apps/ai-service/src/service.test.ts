import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VerificationFinding } from '@counterfeitiq/shared';
import { handleRequest, type Env, type Overrides } from './app';
import { comparePackaging } from './compare';
import { extractionSchema, FIELD_NAMES, NOTICE, type Extraction, type FieldName } from './contract';
import { EXTRACTION_PROMPT, extractPackaging, parseModelReply } from './extract';
import { matchProduct } from './match';
import { compareDosageForms, compareManufacturers, compareStrengths } from './normalize';
import { workersAiProvider, type VisionProvider } from './provider';
import { createSource, type ReferenceSource } from './sources';
import { createDemoSource, DEMO_RECORDS } from './sources/demo';

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const TOKEN = 'test-token';
const env: Env = { AI_SERVICE_TOKEN: TOKEN, REFERENCE_MODE: 'demo' };
const NOW = new Date('2026-10-31T00:00:00.000Z');

type RawField = { value: string | null; evidence: string | null; legibility: 'CLEAR' | 'UNCERTAIN' | null };

function modelReply(overrides: Partial<Record<FieldName, RawField>> = {}, rest: Record<string, unknown> = {}) {
  const blank: RawField = { value: null, evidence: null, legibility: null };
  const fields = Object.fromEntries(FIELD_NAMES.map((name) => [name, blank]));
  return { category: 'medicine', imageQuality: 'GOOD', fields: { ...fields, ...overrides }, activeIngredients: [], otherClaims: [], ...rest };
}

const clear = (value: string, evidence = value): RawField => ({ value, evidence, legibility: 'CLEAR' });

const DEMOZOL_PACK = {
  productName: clear('Demozol'),
  manufacturer: clear('Fictional Labs Nigeria Ltd'),
  nafdacNumber: clear('DEMO-0101', 'NAFDAC Reg. No: DEMO-0101'),
  strength: clear('500 mg'),
  dosageForm: clear('Tablets'),
  expiryDate: clear('2028-01', 'Exp: 2028-01'),
};

const NUMBERLESS_PACK = { ...DEMOZOL_PACK, nafdacNumber: { value: null, evidence: null, legibility: null } };

const extraction = (fields: Partial<Record<FieldName, RawField>> = DEMOZOL_PACK, rest: Record<string, unknown> = {}): Extraction =>
  parseModelReply(JSON.stringify(modelReply(fields, rest)));

function finding(findings: VerificationFinding[], field: string) {
  return findings.find((item) => item.field === field);
}

function fakeProvider(reply: string): VisionProvider {
  return { name: 'fake', model: 'fake-model', complete: async () => reply };
}

function imageRequest(file: File, token = TOKEN) {
  const form = new FormData();
  form.append('image', file);
  return new Request('https://ai.test/extract', { method: 'POST', body: form, headers: { Authorization: `Bearer ${token}` } });
}

function jsonRequest(path: string, body: unknown, token = TOKEN) {
  return new Request(`https://ai.test${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
}

const jpeg = () => new File([JPEG], 'pack.jpg', { type: 'image/jpeg' });

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  // No test may reach a real model or NAFDAC.
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('unexpected network call'); }));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('structured extraction', () => {
  it('returns validated fields with evidence, and lists what is missing', async () => {
    const result = await extractPackaging(jpeg(), fakeProvider(JSON.stringify(modelReply(DEMOZOL_PACK))));
    expect(extractionSchema.safeParse(result).success).toBe(true);
    expect(result.fields.nafdacNumber).toEqual({ value: 'DEMO-0101', evidence: 'NAFDAC Reg. No: DEMO-0101', legibility: 'CLEAR' });
    expect(result.fields.batchNumber).toEqual({ value: null, evidence: null, legibility: 'NOT_VISIBLE' });
    expect(result.missingFields).toContain('batchNumber');
    expect(result.missingFields).not.toContain('productName');
  });

  it('sends the prompt and a data URI of the checked type to the provider', async () => {
    const complete = vi.fn(async () => JSON.stringify(modelReply()));
    await extractPackaging(jpeg(), { name: 'fake', model: 'm', complete });
    expect(complete).toHaveBeenCalledWith(EXTRACTION_PROMPT, expect.stringMatching(/^data:image\/jpeg;base64,/));
  });

  it('uses null for placeholder text the model writes instead of null', () => {
    const result = extraction({ manufacturer: clear('unknown'), strength: clear('N/A') });
    expect(result.fields.manufacturer.value).toBeNull();
    expect(result.fields.strength.value).toBeNull();
  });

  it('reads a bare null field as not printed, as real Gemma replies do', () => {
    const reply = modelReply(DEMOZOL_PACK);
    const result = parseModelReply(JSON.stringify({ ...reply, fields: { ...reply.fields, gtin: null } }));
    expect(result.fields.gtin).toEqual({ value: null, evidence: null, legibility: 'NOT_VISIBLE' });
    expect(result.missingFields).toContain('gtin');
  });

  it('accepts one code fence, and nothing looser', () => {
    const json = JSON.stringify(modelReply(DEMOZOL_PACK));
    expect(parseModelReply(`\`\`\`json\n${json}\n\`\`\``).fields.productName.value).toBe('Demozol');
    expect(() => parseModelReply(`Here it is: ${json}`)).toThrow();
  });

  it.each([
    ['prose', 'I cannot read this'],
    ['an array', '[]'],
    ['an extra key', JSON.stringify(modelReply({}, { verdict: 'genuine' }))],
    ['an extra field', JSON.stringify(modelReply({ authentic: clear('yes') } as never))],
    ['a missing key', JSON.stringify({ category: 'medicine' })],
    ['a wrong type', JSON.stringify(modelReply({ strength: { value: 500, evidence: null, legibility: null } as never }))],
    ['an unknown category', JSON.stringify(modelReply({}, { category: 'miracle' }))],
    ['an unknown image quality', JSON.stringify(modelReply({}, { imageQuality: 'FINE' }))],
  ])('rejects malformed model output: %s', (_name, reply) => {
    expect(() => parseModelReply(reply)).toThrowError(/invalid response/);
  });

  it('never returns values from an image the model calls unreadable', () => {
    const result = extraction(DEMOZOL_PACK, { imageQuality: 'UNREADABLE', activeIngredients: ['Invented'] });
    expect(FIELD_NAMES.every((name) => result.fields[name].value === null)).toBe(true);
    expect(result.activeIngredients).toEqual([]);
    expect(result.category).toBeNull();
  });

  it('marks every value uncertain on a poor image', () => {
    const result = extraction(DEMOZOL_PACK, { imageQuality: 'POOR' });
    expect(result.fields.productName.legibility).toBe('UNCERTAIN');
    expect(result.uncertainFields).toContain('strength');
  });

  it('treats a value missing from its own evidence as uncertain', () => {
    expect(extraction({ productName: clear('Demozol', 'Some other text') }).fields.productName.legibility).toBe('UNCERTAIN');
  });

  it('withholds a registration number that is uncertain, but keeps the evidence', () => {
    const field = extraction({ nafdacNumber: { value: 'DEMO-0101', evidence: 'DEMO-01?1', legibility: 'UNCERTAIN' } }).fields.nafdacNumber;
    expect(field).toEqual({ value: null, evidence: 'DEMO-01?1', legibility: 'UNCERTAIN' });
  });

  it('keeps a date it cannot normalize as evidence, not as a value', () => {
    expect(extraction({ expiryDate: clear('Jan 28', 'EXP Jan 28') }).fields.expiryDate)
      .toEqual({ value: null, evidence: 'EXP Jan 28', legibility: 'UNCERTAIN' });
  });

  it('marks a barcode with a bad check digit as uncertain', () => {
    expect(extraction({ gtin: clear('4006381333931') }).fields.gtin.legibility).toBe('CLEAR');
    expect(extraction({ gtin: clear('4006381333932') }).fields.gtin.legibility).toBe('UNCERTAIN');
  });

  it('rejects bytes that are not an image, whatever the declared type', async () => {
    const fake = new File([new Uint8Array([1, 2, 3, 4])], 'pack.jpg', { type: 'image/jpeg' });
    await expect(extractPackaging(fake, fakeProvider('{}'))).rejects.toThrow(/not a valid/);
  });
});

describe('Workers AI provider', () => {
  const reply = { choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] };

  it('sends the documented request shape', async () => {
    const run = vi.fn(async () => reply);
    await workersAiProvider({ run }, 'model').complete('prompt', 'data:image/png;base64,AA');
    expect(run).toHaveBeenCalledWith('model', expect.objectContaining({
      temperature: 0,
      chat_template_kwargs: { enable_thinking: false },
      messages: [{ role: 'user', content: [
        { type: 'text', text: 'prompt' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,AA' } },
      ] }],
    }));
  });

  it('times out without retrying', async () => {
    const run = vi.fn(() => new Promise(() => undefined));
    await expect(workersAiProvider({ run }, 'm', { timeoutMs: 5 }).complete('p', 'd'))
      .rejects.toMatchObject({ detail: { code: 'MODEL_TIMEOUT', retryable: true } });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('retries a provider fault once, then reports it unavailable', async () => {
    const run = vi.fn(async () => { throw new Error('secret upstream detail'); });
    const error = await workersAiProvider({ run }, 'm', { retryDelayMs: 0 }).complete('p', 'd').catch((caught) => caught);
    expect(error.detail).toMatchObject({ code: 'SERVICE_UNAVAILABLE', retryable: true });
    expect(error.message).not.toContain('secret');
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('recovers when the retry succeeds', async () => {
    const run = vi.fn().mockRejectedValueOnce(new Error('blip')).mockResolvedValueOnce(reply);
    await expect(workersAiProvider({ run }, 'm', { retryDelayMs: 0 }).complete('p', 'd')).resolves.toBe('ok');
  });

  it('does not retry a rate limit', async () => {
    const run = vi.fn(async () => { throw new Error('3036: daily free allocation'); });
    await expect(workersAiProvider({ run }, 'm').complete('p', 'd')).rejects.toMatchObject({ detail: { code: 'RATE_LIMITED' } });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('rejects a truncated reply', async () => {
    const run = vi.fn(async () => ({ choices: [{ message: { content: '{"a"' }, finish_reason: 'length' }] }));
    await expect(workersAiProvider({ run }, 'm').complete('p', 'd')).rejects.toMatchObject({ detail: { code: 'SERVICE_UNAVAILABLE' } });
  });
});

describe('normalization', () => {
  it.each([
    ['500 mg', '500mg', 'MATCH'],
    ['1 g', '1,000 mg', 'MATCH'],
    ['500 mcg', '0.5 mg', 'MATCH'],
    ['125 mg/5 ml', '25 mg/ml', 'MATCH'],
    ['500 mg + 65 mg', '65mg/500mg', 'MATCH'],
    ['500 mg', '250 mg', 'MISMATCH'],
    ['125 mg/5 ml', '250 mg/5 ml', 'MISMATCH'],
    ['500 mg', '500 mg + 65 mg', 'UNKNOWN'],
    ['500 mg', '100 mg/ml', 'UNKNOWN'],
    ['500 mg', 'see leaflet', 'UNKNOWN'],
    [null, '500 mg', 'UNKNOWN'],
  ])('compares strength %s with %s as %s', (first, second, expected) => {
    expect(compareStrengths(first, second)).toBe(expected);
  });

  it.each([
    ['Example Pharma Ltd.', 'Example Pharmaceuticals Limited', 'MATCH'],
    ['Fictional Labs', 'Fictional Laboratories Nigeria Ltd', 'MATCH'],
    ['Fictional Labs', 'Fictional Medical Laboratories Ltd', 'UNKNOWN'],
    ['Fictional Labs', 'Imaginary Pharmaceuticals Plc', 'MISMATCH'],
    [null, 'Imaginary Pharmaceuticals Plc', 'UNKNOWN'],
  ])('compares manufacturer %s with %s as %s', (first, second, expected) => {
    expect(compareManufacturers(first, second)).toBe(expected);
  });

  it('groups dosage forms without calling related forms different', () => {
    expect(compareDosageForms('Film-coated tablets', 'Tablet')).toBe('MATCH');
    expect(compareDosageForms('Syrup', 'Oral suspension')).toBe('MATCH');
    expect(compareDosageForms('Capsule', 'Tablet')).toBe('MISMATCH');
    expect(compareDosageForms('Sachet', 'Tablet')).toBe('UNKNOWN');
  });
});

describe('product matching', () => {
  const source = createDemoSource(() => NOW);

  it('finds a record by exact registration number', async () => {
    const result = await matchProduct(extraction(), source);
    expect(result.outcome).toBe('REGISTRATION_NUMBER_FOUND');
    expect(result.candidates[0]).toMatchObject({ basis: 'REGISTRATION_NUMBER', record: { nafdacNumber: 'DEMO-0101' } });
    expect(result.candidates[0]?.matchedFields).toContain('strength');
  });

  it('uses the strength to narrow the candidates when the number is missing', async () => {
    const result = await matchProduct(extraction(NUMBERLESS_PACK), source);
    expect(result.outcome).toBe('SINGLE_CANDIDATE');
    expect(result.candidates[0]?.record.nafdacNumber).toBe('DEMO-0101');
    expect(result.explanation).toContain('no registration number confirms it');
  });

  it('refuses to choose between records the pack cannot tell apart', async () => {
    const result = await matchProduct(extraction({ productName: clear('Demozol') }), source);
    expect(result.outcome).toBe('MULTIPLE_CANDIDATES');
    expect(result.candidates.map((item) => item.record.nafdacNumber).sort()).toEqual(['DEMO-0101', 'DEMO-0102']);
  });

  it('matches a product by its brand name when that is all that was read', async () => {
    const result = await matchProduct(extraction({ brandName: clear('Placebrin Syrup') }), source);
    expect(result.candidates[0]?.record.nafdacNumber).toBe('DEMO-0201');
  });

  it('does not treat a missing match as evidence of counterfeiting', async () => {
    const result = await matchProduct(extraction({ productName: clear('Unlisted') }), source);
    expect(result.outcome).toBe('NO_CANDIDATES');
    expect(result.explanation).toContain('not evidence of counterfeiting');
  });

  it('reports a fixture miss as unavailable, never as not found', async () => {
    const result = await matchProduct(extraction({ nafdacNumber: clear('DEMO-0999') }), source);
    expect(result.outcome).toBe('SOURCE_UNAVAILABLE');
    expect(result.provenance.isDemo).toBe(true);
  });

  it('does not look up a non-medicine', async () => {
    const lookup = vi.fn();
    const result = await matchProduct(extraction(DEMOZOL_PACK, { category: 'food' }), { ...source, lookup });
    expect(result.outcome).toBe('NOT_APPLICABLE');
    expect(lookup).not.toHaveBeenCalled();
  });
});

describe('deterministic comparison', () => {
  const source = createDemoSource(() => NOW);
  const compare = (pack: Extraction, selected?: string, reference: ReferenceSource = source) =>
    comparePackaging(pack, reference, selected, NOW);

  it('reports matching details, and never confirms the physical pack', async () => {
    const result = await compare(extraction());
    expect(result.status).toBe('REGISTRATION_DETAILS_MATCH');
    expect(finding(result.findings, 'strength')?.status).toBe('MATCH');
    expect(result.physicalAuthenticityConfirmed).toBe(false);
    expect(result.notice).toBe(NOTICE);
  });

  it('reports a strength mismatch with both values', async () => {
    const result = await compare(extraction({ ...DEMOZOL_PACK, strength: clear('250 mg') }));
    expect(result.status).toBe('DETAILS_MISMATCH');
    expect(finding(result.findings, 'strength')).toMatchObject({
      code: 'STRENGTH_MISMATCH', severity: 'HIGH', packagingValue: '250 mg', referenceValue: '500 mg',
    });
  });

  it('does not call a hard-to-read value a discrepancy', async () => {
    const result = await compare(extraction({ ...DEMOZOL_PACK, strength: { value: '250 mg', evidence: '250 mg', legibility: 'UNCERTAIN' } }));
    expect(finding(result.findings, 'strength')).toMatchObject({ code: 'STRENGTH_NEEDS_CLEARER_PHOTO', status: 'UNKNOWN' });
    expect(result.status).not.toBe('DETAILS_MISMATCH');
  });

  it('compares a selected candidate as a registration mismatch', async () => {
    const result = await compare(extraction(), 'DEMO-0102');
    expect(finding(result.findings, 'nafdacNumber')?.status).toBe('MISMATCH');
    expect(result.status).toBe('DETAILS_MISMATCH');
  });

  it('keeps hyphen position significant in registration numbers', async () => {
    const record = { ...DEMO_RECORDS[0]!, nafdacNumber: 'A1-123456' };
    const reference: ReferenceSource = {
      ...source,
      lookup: async () => ({ ...await source.lookup('DEMO-0101'), record } as never),
    };
    const result = await compare(extraction({ ...DEMOZOL_PACK, nafdacNumber: clear('A11-23456') }), undefined, reference);
    expect(finding(result.findings, 'nafdacNumber')?.status).toBe('MISMATCH');
  });

  it('reports a missing identifier without a lookup', async () => {
    const lookup = vi.fn();
    const result = await compare(extraction(NUMBERLESS_PACK), undefined, { ...source, lookup });
    expect(result.status).toBe('INSUFFICIENT_EVIDENCE');
    expect(result.packagingNotes.map((note) => note.code)).toContain('MISSING_PRODUCT_IDENTIFIER');
    expect(result.provenance.category).toBe('NO_SOURCE');
    expect(lookup).not.toHaveBeenCalled();
  });

  it('asks for inspection of a date it could not read', async () => {
    const result = await compare(extraction({ ...DEMOZOL_PACK, expiryDate: clear('Jan 28', 'EXP Jan 28') }));
    expect(result.packagingNotes.map((note) => note.code)).toContain('EXPIRY_DATE_REQUIRES_INSPECTION');
  });

  it('keeps package expiry and registration expiry apart', async () => {
    const later = new Date('2028-06-01T00:00:00.000Z');
    const expiredPack = await comparePackaging(extraction(), source, undefined, later);
    const codes = expiredPack.packagingNotes.map((note) => note.code);
    expect(codes).toContain('PACKAGE_EXPIRED');
    expect(codes).not.toContain('REGISTRATION_EXPIRED');

    const muchLater = await comparePackaging(extraction({ ...DEMOZOL_PACK, expiryDate: clear('2031-01') }), source, undefined, new Date('2030-01-01T00:00:00.000Z'));
    const laterCodes = muchLater.packagingNotes.map((note) => note.code);
    expect(laterCodes).toContain('REGISTRATION_EXPIRED');
    expect(laterCodes).not.toContain('PACKAGE_EXPIRED');
  });

  it('flags printed dates that contradict each other', async () => {
    const result = await compare(extraction({ ...DEMOZOL_PACK, manufacturingDate: clear('2029-01') }));
    expect(result.packagingNotes.map((note) => note.code)).toContain('PACKAGING_DATES_INCONSISTENT');
  });

  it('notes a registration that is not active', async () => {
    const reference: ReferenceSource = {
      ...source,
      lookup: async () => ({ ...await source.lookup('DEMO-0101'), record: { ...DEMO_RECORDS[0]!, registrationStatus: 'Withdrawn' } } as never),
    };
    const result = await compare(extraction(), undefined, reference);
    expect(result.packagingNotes.map((note) => note.code)).toContain('REGISTRATION_NOT_ACTIVE');
  });

  it('reports a missing reference as unavailable, with no findings', async () => {
    const result = await compare(extraction({ ...DEMOZOL_PACK, nafdacNumber: clear('DEMO-0999') }));
    expect(result.status).toBe('REFERENCE_UNAVAILABLE');
    expect(result.findings).toEqual([]);
  });
});

describe('source provenance and demo isolation', () => {
  const liveBody = (rows: unknown[]) => JSON.stringify({ draw: 1, recordsTotal: 9000, recordsFiltered: rows.length, data: rows });
  const liveFetch = (body: string, status = 200) => vi.fn(async () => new Response(body, { status, headers: { 'Content-Type': 'application/json' } })) as unknown as typeof fetch;
  const live = (send: typeof fetch) => createSource({ mode: 'authorized_live', greenbookAccessBasis: 'test-basis', fetch: send, now: () => NOW });
  // Unique numbers: the adapter's isolate cache must not answer these tests.
  const row = { product_name: 'Live Product', NAFDAC: 'T1-000001', strength: '10 mg', status: 'Active' };

  it('labels demo answers as demo, with timestamps', async () => {
    const result = await matchProduct(extraction(), createDemoSource(() => NOW));
    expect(result.provenance).toMatchObject({
      category: 'DEMO_FIXTURE', isDemo: true, officialIntegration: false,
      requestedAt: NOW.toISOString(), retrievedAt: DEMO_RECORDS[0]?.retrievedAt,
    });
    expect(result.provenance.note).toContain('Fictional');
  });

  it('uses only DEMO- numbers in the fixtures', () => {
    expect(DEMO_RECORDS.every((record) => record.nafdacNumber.startsWith('DEMO-'))).toBe(true);
  });

  it('labels live answers as live, and never as an official integration', async () => {
    const result = await matchProduct(extraction({ nafdacNumber: clear('T1-000001') }), live(liveFetch(liveBody([row]))));
    expect(result.provenance).toMatchObject({
      category: 'LIVE_REGULATORY_REFERENCE', isDemo: false, officialIntegration: false,
      sourceUrl: 'https://greenbook.nafdac.gov.ng/', requestedAt: NOW.toISOString(),
    });
  });

  it('never answers from fixtures in live mode', async () => {
    const send = liveFetch('down', 500);
    const result = await matchProduct(extraction(), live(send));
    expect(send).toHaveBeenCalled();
    expect(result.outcome).toBe('SOURCE_UNAVAILABLE');
    expect(result.candidates).toEqual([]);
    expect(result.provenance).toMatchObject({ category: 'SOURCE_UNAVAILABLE', isDemo: false });
  });

  it('reports a complete live miss as not found, and not as fake', async () => {
    const result = await matchProduct(extraction({ nafdacNumber: clear('T1-000002') }), live(liveFetch(liveBody([]))));
    expect(result.outcome).toBe('REGISTRATION_NOT_FOUND');
    expect(result.explanation).toContain('not evidence of counterfeiting');
  });

  it('sends no name search to the live source', async () => {
    const send = liveFetch(liveBody([]));
    const result = await matchProduct(extraction({ productName: clear('Demozol') }), live(send));
    expect(result.outcome).toBe('NO_SOURCE');
    expect(send).not.toHaveBeenCalled();
  });

  it('sends nothing without an access basis', async () => {
    const send = liveFetch(liveBody([]));
    const source = createSource({ mode: 'authorized_live', fetch: send });
    const result = await matchProduct(extraction({ nafdacNumber: clear('T1-000003') }), source);
    expect(result.provenance.category).toBe('NO_SOURCE');
    expect(send).not.toHaveBeenCalled();
  });

  it('fails closed on an unknown mode instead of serving fixtures', async () => {
    const result = await matchProduct(extraction(), createSource({ mode: 'demoo' }));
    expect(result.outcome).toBe('NO_SOURCE');
    expect(result.provenance.isDemo).toBe(false);
  });
});

describe('service endpoints', () => {
  const overrides: Overrides = { provider: fakeProvider(JSON.stringify(modelReply(DEMOZOL_PACK))), now: () => NOW };

  it('reports health without a token, and without the token value', async () => {
    const response = await handleRequest(new Request('https://ai.test/health'), env);
    const body = await response.json();
    expect(body).toMatchObject({ status: 'ok', authConfigured: true, referenceMode: 'demo' });
    expect(JSON.stringify(body)).not.toContain(TOKEN);
  });

  it('extracts through the endpoint and reports the model used', async () => {
    const response = await handleRequest(imageRequest(jpeg()), env, overrides);
    expect(response.status).toBe(200);
    const body = await response.json() as { extraction: Extraction; inference: { model: string } };
    expect(body.extraction.fields.productName.value).toBe('Demozol');
    expect(body.inference.model).toBe('fake-model');
  });

  it('runs extract, match and compare in sequence', async () => {
    const { extraction: pack } = await (await handleRequest(imageRequest(jpeg()), env, overrides)).json() as { extraction: Extraction };
    const match = await (await handleRequest(jsonRequest('/match-product', { extraction: pack }), env, overrides)).json();
    const compare = await (await handleRequest(jsonRequest('/compare-packaging', { extraction: pack }), env, overrides)).json();
    expect(match).toMatchObject({ outcome: 'REGISTRATION_NUMBER_FOUND', provenance: { category: 'DEMO_FIXTURE' } });
    expect(compare).toMatchObject({ status: 'REGISTRATION_DETAILS_MATCH', physicalAuthenticityConfirmed: false });
  });

  it.each(['/extract', '/match-product', '/compare-packaging'])('requires the token on %s', async (path) => {
    const wrong = new Request(`https://ai.test${path}`, { method: 'POST', headers: { Authorization: 'Bearer wrong' } });
    expect((await handleRequest(wrong, env, overrides)).status).toBe(401);
    const none = new Request(`https://ai.test${path}`, { method: 'POST' });
    expect((await handleRequest(none, env, overrides)).status).toBe(401);
  });

  it('fails closed when no token is configured', async () => {
    const response = await handleRequest(imageRequest(jpeg()), {}, overrides);
    expect(response.status).toBe(503);
  });

  it('rejects an invalid file type', async () => {
    const response = await handleRequest(imageRequest(new File(['text'], 'a.txt', { type: 'text/plain' })), env, overrides);
    expect(response.status).toBe(415);
    expect(await response.json()).toMatchObject({ error: { code: 'INVALID_FILE_TYPE' } });
  });

  it('rejects an image over 4 MiB', async () => {
    const big = new File([JPEG, new Uint8Array(4 * 1024 * 1024)], 'big.jpg', { type: 'image/jpeg' });
    const response = await handleRequest(imageRequest(big), env, overrides);
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ error: { code: 'FILE_TOO_LARGE' } });
  });

  it('accepts an image of exactly 4 MiB', async () => {
    const exact = new File([JPEG, new Uint8Array(4 * 1024 * 1024 - JPEG.length)], 'max.jpg', { type: 'image/jpeg' });
    expect((await handleRequest(imageRequest(exact), env, overrides)).status).toBe(200);
  });

  it('stops reading a body with no declared length at the limit', async () => {
    const stream = new ReadableStream({
      pull(controller) { controller.enqueue(new Uint8Array(1024 * 1024)); },
    });
    const request = new Request('https://ai.test/extract', {
      method: 'POST', body: stream, duplex: 'half',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'multipart/form-data; boundary=x' },
    } as RequestInit);
    expect((await handleRequest(request, env, overrides)).status).toBe(413);
  });

  it('rejects a missing and an empty image', async () => {
    const form = new FormData();
    form.append('other', 'x');
    const missing = new Request('https://ai.test/extract', { method: 'POST', body: form, headers: { Authorization: `Bearer ${TOKEN}` } });
    expect((await handleRequest(missing, env, overrides)).status).toBe(422);
    expect((await handleRequest(imageRequest(new File([], 'e.jpg', { type: 'image/jpeg' })), env, overrides)).status).toBe(422);
  });

  it('returns an honest error, not mock data, when no model is configured', async () => {
    const response = await handleRequest(imageRequest(jpeg()), env);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: 'SERVICE_UNAVAILABLE' } });
  });

  it('reports malformed model output as a retryable error', async () => {
    const response = await handleRequest(imageRequest(jpeg()), env, { provider: fakeProvider('not json') });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { retryable: true } });
  });

  it('maps a provider timeout to 504', async () => {
    const ai = { run: () => new Promise(() => undefined) };
    const provider = workersAiProvider(ai, 'm', { timeoutMs: 5 });
    const response = await handleRequest(imageRequest(jpeg()), env, { provider });
    expect(response.status).toBe(504);
  });

  it('rejects requests that do not match the contract', async () => {
    const pack = extraction();
    expect((await handleRequest(jsonRequest('/match-product', { extraction: { ...pack, fields: {} } }), env)).status).toBe(400);
    expect((await handleRequest(jsonRequest('/compare-packaging', { extraction: pack, record: {} }), env)).status).toBe(400);
    const notJson = new Request('https://ai.test/match-product', { method: 'POST', body: '{', headers: { Authorization: `Bearer ${TOKEN}` } });
    expect((await handleRequest(notJson, env)).status).toBe(400);
  });

  it('rate limits with Retry-After', async () => {
    const limited = { ...env, EXTRACT_LIMITER: { limit: async () => ({ success: false }) } };
    const response = await handleRequest(imageRequest(jpeg()), limited, overrides);
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('60');
  });

  it('sends no CORS headers, because browsers must not call this service', async () => {
    const request = new Request('https://ai.test/extract', { method: 'OPTIONS', headers: { Origin: 'https://evil.test' } });
    const response = await handleRequest(request, env);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});
