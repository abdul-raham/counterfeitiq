import {
  shouldLookupMedicine,
  type AnalysisResponse,
  type ApiError,
  type ApiErrorResponse,
  type ExtractedProduct,
  type ReferenceLookupResult,
} from '@counterfeitiq/shared';
import { buildInvestigation } from '../services/investigation';
import { validateUpload } from '../upload-validation';

export interface AnalyzeDependencies {
  extractProduct(image: Blob): Promise<ExtractedProduct>;
  lookupMedicine(number: string): Promise<ReferenceLookupResult>;
  now?: () => Date;
}

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

function errorResponse(error: ApiError): Response {
  const body: ApiErrorResponse = { error };
  return Response.json(body, { status: statusByCode[error.code] });
}

function isNullableString(value: unknown): value is string | null {
  return typeof value === 'string' || value === null;
}

function isExtractedProduct(value: unknown): value is ExtractedProduct {
  if (!value || typeof value !== 'object') return false;
  const product = value as Record<string, unknown>;
  const nullableFields = [
    'category', 'productName', 'brand', 'nafdacNumber', 'manufacturer', 'strength',
    'batchNumber', 'manufacturingDate', 'expiryDate',
  ];
  return nullableFields.every((field) => isNullableString(product[field]))
    && Array.isArray(product.ingredients)
    && product.ingredients.every((ingredient) => typeof ingredient === 'string');
}

export async function analyzeRequest(request: Request, dependencies: AnalyzeDependencies): Promise<Response> {
  try {
    const contentType = request.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
      return errorResponse({
        code: 'INVALID_FILE_TYPE',
        message: 'Submit a JPEG, PNG or WebP image as multipart form field "image".',
        retryable: false,
      });
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return errorResponse({ code: 'UNREADABLE_IMAGE', message: 'The uploaded image could not be read.', retryable: false });
    }
    const image = form.get('image');
    if (!(image instanceof File)) {
      return errorResponse({ code: 'UNREADABLE_IMAGE', message: 'The image field is missing or unreadable.', retryable: false });
    }
    const validationError = validateUpload(image);
    if (validationError) return errorResponse(validationError);

    const extracted: unknown = await dependencies.extractProduct(image);
    if (!isExtractedProduct(extracted)) {
      throw new AnalysisApiError({
        code: 'SERVICE_UNAVAILABLE',
        message: 'The image model returned an invalid response.',
        retryable: true,
      });
    }
    let reference: ReferenceLookupResult | null = null;
    if (shouldLookupMedicine(extracted)) {
      reference = await dependencies.lookupMedicine(extracted.nafdacNumber!.trim());
    }

    const response: AnalysisResponse = {
      extracted,
      reference,
      verification: buildInvestigation(extracted, reference, dependencies.now?.() ?? new Date()),
    };
    return Response.json(response);
  } catch (error) {
    if (error instanceof AnalysisApiError) return errorResponse(error.detail);
    return errorResponse({ code: 'INTERNAL_ERROR', message: 'The analysis could not be completed.', retryable: true });
  }
}
