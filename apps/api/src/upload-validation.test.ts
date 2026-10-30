import { describe, expect, it } from 'vitest';
import { MAX_IMAGE_BYTES, validateUpload } from './upload-validation';

describe('Worker upload validation', () => {
  it('rejects bytes above the shared frontend/backend maximum', () => {
    expect(validateUpload({ type: 'image/png', size: MAX_IMAGE_BYTES + 1 })).toMatchObject({
      code: 'FILE_TOO_LARGE', retryable: false,
    });
  });

  it('rejects invalid MIME types', () => {
    expect(validateUpload({ type: 'application/pdf', size: 1 })).toMatchObject({
      code: 'INVALID_FILE_TYPE', retryable: false,
    });
  });
});
