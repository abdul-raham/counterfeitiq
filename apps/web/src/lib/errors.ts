import type { ApiErrorCode } from '@counterfeitiq/shared';

export type RequestErrorCode = ApiErrorCode | 'OFFLINE' | 'REQUEST_TIMEOUT' | 'BAD_RESPONSE';

export class RequestError extends Error {
  readonly code: RequestErrorCode;
  readonly retryable: boolean;

  constructor(code: RequestErrorCode, retryable: boolean) {
    super(code);
    this.name = 'RequestError';
    this.code = code;
    this.retryable = retryable;
  }
}

export function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export function toRequestError(error: unknown): RequestError {
  return error instanceof RequestError ? error : new RequestError('INTERNAL_ERROR', true);
}

const copy: Record<RequestErrorCode, { title: string; body: string }> = {
  INVALID_FILE_TYPE: {
    title: 'That file type is not supported',
    body: 'Choose a JPEG, PNG or WebP image.',
  },
  FILE_TOO_LARGE: {
    title: 'That image is too large',
    body: 'Choose an image no larger than 4 MB, or take a new photo.',
  },
  UNREADABLE_IMAGE: {
    title: 'We could not read that image',
    body: 'Try another photo in good light, with the packaging text in focus.',
  },
  MODEL_TIMEOUT: {
    title: 'Reading the photo took too long',
    body: 'Nothing was concluded about this product. Please try again.',
  },
  RATE_LIMITED: {
    title: 'Too many requests right now',
    body: 'Please wait a moment and try again.',
  },
  SERVICE_UNAVAILABLE: {
    title: 'The service is unavailable',
    body: 'Nothing was concluded about this product. Please try again shortly.',
  },
  INTERNAL_ERROR: {
    title: 'Something went wrong on our side',
    body: 'Nothing was concluded about this product. Please try again.',
  },
  OFFLINE: {
    title: 'You appear to be offline',
    body: 'Check your connection and try again. Your photo is still here.',
  },
  REQUEST_TIMEOUT: {
    title: 'This took too long',
    body: 'Nothing was concluded about this product. Please try again.',
  },
  BAD_RESPONSE: {
    title: 'We received a result we could not trust',
    body: 'The response was incomplete, so we are not showing it. Please try again.',
  },
};

export function errorCopy(code: RequestErrorCode) {
  return copy[code] ?? copy.INTERNAL_ERROR;
}
