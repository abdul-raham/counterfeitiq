import {
  ACCEPTED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  validateImageFile,
  type ApiError,
} from '@counterfeitiq/shared';

export { ACCEPTED_IMAGE_TYPES, MAX_IMAGE_BYTES };

export function validateUpload(file: Pick<File, 'size' | 'type'>): ApiError | null {
  return validateImageFile(file);
}
