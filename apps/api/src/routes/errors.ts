import type { ApiError, ApiErrorResponse } from '@counterfeitiq/shared';

export class AnalysisApiError extends Error {
  constructor(public readonly detail: ApiError) {
    super(detail.message);
    this.name = 'AnalysisApiError';
  }
}

const statusByCode: Record<ApiError['code'], number> = {
  INVALID_FILE_TYPE: 415,
  FILE_TOO_LARGE: 413,
  UNREADABLE_IMAGE: 422,
  MODEL_TIMEOUT: 504,
  RATE_LIMITED: 429,
  SERVICE_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500,
};

export function apiErrorResponse(error: ApiError, status = statusByCode[error.code]): Response {
  const body: ApiErrorResponse = { error };
  return Response.json(body, { status });
}

export function unexpectedApiErrorResponse(): Response {
  return apiErrorResponse({
    code: 'INTERNAL_ERROR',
    message: 'The request could not be completed.',
    retryable: true,
  });
}
