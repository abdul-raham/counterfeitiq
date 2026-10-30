import {
  shouldLookupMedicine,
  type AnalysisResponse,
  type ExtractedProduct,
  type ReferenceLookupResult,
} from '@counterfeitiq/shared';
import { buildInvestigation } from '../services/investigation';
import { validateUpload } from '../upload-validation';
import { AnalysisApiError, apiErrorResponse, unexpectedApiErrorResponse } from './errors';

export { AnalysisApiError } from './errors';

export interface AnalyzeDependencies {
  extractProduct(image: Blob): Promise<ExtractedProduct>;
  lookupMedicine(number: string): Promise<ReferenceLookupResult>;
  now?: () => Date;
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
      return apiErrorResponse({
        code: 'INVALID_FILE_TYPE',
        message: 'Submit a JPEG, PNG or WebP image as multipart form field "image".',
        retryable: false,
      });
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return apiErrorResponse({ code: 'UNREADABLE_IMAGE', message: 'The uploaded image could not be read.', retryable: false });
    }
    const image = form.get('image');
    if (!(image instanceof File)) {
      return apiErrorResponse({ code: 'UNREADABLE_IMAGE', message: 'The image field is missing or unreadable.', retryable: false });
    }
    const validationError = validateUpload(image);
    if (validationError) return apiErrorResponse(validationError);

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
    if (error instanceof AnalysisApiError) return apiErrorResponse(error.detail);
    return unexpectedApiErrorResponse();
  }
}
