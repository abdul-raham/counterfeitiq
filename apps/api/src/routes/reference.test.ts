import { describe, expect, it, vi } from 'vitest';
import type { ReferenceLookupResult } from '@counterfeitiq/shared';
import { AnalysisApiError } from './errors';
import { referenceRequest } from './reference';

const liveNotFound: ReferenceLookupResult = {
  status: 'NOT_FOUND', record: null,
  provenance: {
    source: 'NAFDAC_GREENBOOK', mode: 'LIVE_OFFICIAL', authoritative: true,
    requestedAt: '2026-10-31T00:00:00.000Z',
  },
};

describe('manual reference route', () => {
  it('decodes the number and returns a validated lookup result', async () => {
    const lookupMedicine = vi.fn().mockResolvedValue(liveNotFound);
    const response = await referenceRequest(
      new Request('https://example.test/api/reference/A1-123'),
      'A1%2D123',
      { lookupMedicine },
    );
    expect(response.status).toBe(200);
    expect(lookupMedicine).toHaveBeenCalledWith('A1-123');
    expect(await response.json()).toEqual(liveNotFound);
  });

  it('rejects empty and malformed encoded numbers without calling the adapter', async () => {
    for (const encodedNumber of ['%20', '%E0%A4%A']) {
      const lookupMedicine = vi.fn();
      const response = await referenceRequest(
        new Request('https://example.test/api/reference/value'),
        encodedNumber,
        { lookupMedicine },
      );
      expect(response.status).toBe(400);
      expect(lookupMedicine).not.toHaveBeenCalled();
    }
  });

  it('rejects fixture misses masquerading as authoritative not-found', async () => {
    const lookupMedicine = vi.fn().mockResolvedValue({
      status: 'NOT_FOUND', record: null,
      provenance: {
        source: 'DEMO_FIXTURE', mode: 'DEMO_FIXTURE', authoritative: false,
        requestedAt: '2026-10-31T00:00:00.000Z',
      },
    });
    const response = await referenceRequest(
      new Request('https://example.test/api/reference/A1-123'),
      'A1-123',
      { lookupMedicine },
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: 'SERVICE_UNAVAILABLE', retryable: true } });
  });

  it('rejects inconsistent unavailable provenance and invalid timestamps', async () => {
    for (const result of [
      {
        status: 'SOURCE_UNAVAILABLE', record: null,
        provenance: { source: 'NONE', mode: 'LIVE_OFFICIAL', authoritative: false, requestedAt: null },
      },
      {
        status: 'NOT_FOUND', record: null,
        provenance: { source: 'NAFDAC_GREENBOOK', mode: 'LIVE_OFFICIAL', authoritative: true, requestedAt: 'not-a-date' },
      },
    ]) {
      const response = await referenceRequest(
        new Request('https://example.test/api/reference/A1-123'),
        'A1-123',
        { lookupMedicine: vi.fn().mockResolvedValue(result) },
      );
      expect(response.status).toBe(503);
    }
  });

  it('maps known adapter errors and hides unexpected errors', async () => {
    const known = await referenceRequest(
      new Request('https://example.test/api/reference/A1-123'),
      'A1-123',
      { lookupMedicine: vi.fn().mockRejectedValue(new AnalysisApiError({ code: 'RATE_LIMITED', message: 'Wait.', retryable: true })) },
    );
    expect(known.status).toBe(429);

    const unexpected = await referenceRequest(
      new Request('https://example.test/api/reference/A1-123'),
      'A1-123',
      { lookupMedicine: vi.fn().mockRejectedValue(new Error('secret detail')) },
    );
    expect(unexpected.status).toBe(500);
    expect(await unexpected.text()).not.toContain('secret detail');
  });
});
