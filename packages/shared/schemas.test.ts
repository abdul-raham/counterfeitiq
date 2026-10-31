import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  MAX_IMAGE_BYTES,
  shouldLookupMedicine,
  validateImageFile,
  type ApiError,
  type ReferenceLookupResult,
} from './schemas';

describe('image contract', () => {
  it('uses the same exported byte limit for exact boundary checks', () => {
    expect(validateImageFile({ type: 'image/jpeg', size: MAX_IMAGE_BYTES })).toBeNull();
    expect(validateImageFile({ type: 'image/jpeg', size: MAX_IMAGE_BYTES + 1 })).toMatchObject({
      code: 'FILE_TOO_LARGE', retryable: false,
    });
  });

  it('rejects unsupported file types with a standardized error', () => {
    expect(validateImageFile({ type: 'image/gif', size: 100 })).toEqual({
      code: 'INVALID_FILE_TYPE', message: 'Choose a JPEG, PNG or WebP image.', retryable: false,
    });
  });
});

describe('lookup contract', () => {
  it('does not execute a lookup without a number', () => {
    expect(shouldLookupMedicine({ category: 'medicine', nafdacNumber: null })).toBe(false);
  });

  it('does not execute a Greenbook lookup for non-medicines', () => {
    expect(shouldLookupMedicine({ category: 'food', nafdacNumber: 'A1-123' })).toBe(false);
  });

  it.each(['medicine', 'Medicines', 'drug', 'medication', 'pharmaceutical', 'medicinal product'])(
    'executes a medicine lookup for the explicit category alias %s',
    (category) => {
      expect(shouldLookupMedicine({ category, nafdacNumber: 'A1-123' })).toBe(true);
    },
  );

  it.each(['food', 'cosmetic', 'medical device', null])(
    'does not broaden Greenbook lookup to %s',
    (category) => {
      expect(shouldLookupMedicine({ category, nafdacNumber: 'A1-123' })).toBe(false);
    },
  );

  it('requires authoritative live provenance for NOT_FOUND', () => {
    const result: ReferenceLookupResult = {
      status: 'NOT_FOUND', record: null,
      provenance: {
        source: 'NAFDAC_GREENBOOK', mode: 'LIVE_OFFICIAL', authoritative: true,
        requestedAt: '2026-10-30T00:00:00.000Z',
      },
    };
    expect(result.provenance.authoritative).toBe(true);
  });

  it('represents fixture misses as unavailable, never official not-found', () => {
    const result: ReferenceLookupResult = {
      status: 'SOURCE_UNAVAILABLE', record: null,
      provenance: {
        source: 'DEMO_FIXTURE', mode: 'DEMO_FIXTURE', authoritative: false,
        requestedAt: '2026-10-30T00:00:00.000Z', note: 'No matching demo fixture.',
      },
    };
    expect(result.status).toBe('SOURCE_UNAVAILABLE');
    expect(result.provenance.authoritative).toBe(false);
  });

  it('supports standardized operational error variants', () => {
    expectTypeOf<ApiError['code']>().toEqualTypeOf<
      'INVALID_FILE_TYPE' | 'FILE_TOO_LARGE' | 'UNREADABLE_IMAGE' | 'MODEL_TIMEOUT' |
      'RATE_LIMITED' | 'SERVICE_UNAVAILABLE' | 'INTERNAL_ERROR'
    >();
  });
});
