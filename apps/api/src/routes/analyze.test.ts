import { describe, expect, it, vi } from 'vitest';
import { MAX_IMAGE_BYTES, type ExtractedProduct, type ReferenceLookupResult } from '@counterfeitiq/shared';
import { AnalysisApiError, analyzeRequest, type AnalyzeDependencies } from './analyze';

const medicine: ExtractedProduct = {
  category: 'medicine', productName: 'Example', brand: null, nafdacNumber: 'A1-123',
  manufacturer: null, strength: null, ingredients: [], batchNumber: null,
  manufacturingDate: null, expiryDate: null,
};

const unavailable: ReferenceLookupResult = {
  status: 'SOURCE_UNAVAILABLE', record: null,
  provenance: { source: 'NONE', mode: 'NOT_EXECUTED', authoritative: false, requestedAt: null },
};

function request(file: File): Request {
  const form = new FormData();
  form.set('image', file);
  return new Request('https://example.test/api/analyze', { method: 'POST', body: form });
}

function dependencies(product = medicine): AnalyzeDependencies {
  return {
    extractProduct: vi.fn().mockResolvedValue(product),
    lookupMedicine: vi.fn().mockResolvedValue(unavailable),
    now: () => new Date('2026-10-31T12:00:00.000Z'),
  };
}

describe('analyze route', () => {
  it('rejects invalid and oversized files with ApiError responses', async () => {
    const invalid = await analyzeRequest(request(new File(['x'], 'x.gif', { type: 'image/gif' })), dependencies());
    expect(invalid.status).toBe(415);
    expect(await invalid.json()).toMatchObject({ error: { code: 'INVALID_FILE_TYPE', retryable: false } });

    const oversized = await analyzeRequest(
      request(new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], 'x.jpg', { type: 'image/jpeg' })),
      dependencies(),
    );
    expect(oversized.status).toBe(413);
    expect(await oversized.json()).toMatchObject({ error: { code: 'FILE_TOO_LARGE', retryable: false } });
  });

  it('does not call lookup for a missing number or non-medicine', async () => {
    for (const product of [{ ...medicine, nafdacNumber: null }, { ...medicine, category: 'cosmetic' }]) {
      const deps = dependencies(product);
      const response = await analyzeRequest(request(new File(['image'], 'x.jpg', { type: 'image/jpeg' })), deps);
      expect(response.status).toBe(200);
      expect(deps.lookupMedicine).not.toHaveBeenCalled();
      expect((await response.json() as { reference: unknown }).reference).toBeNull();
    }
  });

  it('maps known model timeout and rate-limit errors', async () => {
    for (const detail of [
      { code: 'MODEL_TIMEOUT' as const, message: 'Model timed out.', retryable: true },
      { code: 'RATE_LIMITED' as const, message: 'Try later.', retryable: true },
    ]) {
      const deps = dependencies();
      deps.extractProduct = vi.fn().mockRejectedValue(new AnalysisApiError(detail));
      const response = await analyzeRequest(request(new File(['image'], 'x.png', { type: 'image/png' })), deps);
      expect(response.status).toBe(detail.code === 'MODEL_TIMEOUT' ? 504 : 429);
      expect(await response.json()).toEqual({ error: detail });
    }
  });

  it('hides unexpected internal error details', async () => {
    const deps = dependencies();
    deps.extractProduct = vi.fn().mockRejectedValue(new Error('provider secret'));
    const response = await analyzeRequest(request(new File(['image'], 'x.webp', { type: 'image/webp' })), deps);
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('provider secret');
  });

  it('rejects malformed model output as a retryable service failure', async () => {
    const deps = dependencies();
    deps.extractProduct = vi.fn().mockResolvedValue({ productName: 'incomplete' });
    const response = await analyzeRequest(request(new File(['image'], 'x.jpg', { type: 'image/jpeg' })), deps);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: { code: 'SERVICE_UNAVAILABLE', retryable: true },
    });
  });
});
