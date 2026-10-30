import { describe, expect, it } from 'vitest';
import { MAX_IMAGE_BYTES, validateImageFile } from '@counterfeitiq/shared';

describe('frontend upload validation', () => {
  it('imports and enforces the shared upload ceiling', () => {
    expect(validateImageFile({ type: 'image/webp', size: MAX_IMAGE_BYTES + 1 })?.code).toBe('FILE_TOO_LARGE');
  });
});
