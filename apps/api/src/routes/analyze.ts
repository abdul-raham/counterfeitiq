import {
  MAX_IMAGE_BYTES,
  shouldLookupMedicine,
  type AnalysisResponse,
  type ExtractedProduct,
  type ReferenceLookupResult,
} from '@counterfeitiq/shared';
import { buildInvestigation } from '../services/investigation';
import { validateUpload } from '../upload-validation';
import { AnalysisApiError, apiErrorResponse, unexpectedApiErrorResponse } from './errors';
import { isReferenceLookupResult } from './reference';

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

/** Reads at most maxBytes, so a chunked upload with no Content-Length cannot exhaust memory. */
async function readBoundedForm(request: Request, contentType: string, maxBytes: number): Promise<FormData | null> {
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new Response(body, { headers: { 'content-type': contentType } }).formData();
}

export async function analyzeRequest(request: Request, dependencies: AnalyzeDependencies): Promise<Response> {
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } });

  try {
    const contentType = request.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
      return apiErrorResponse({
        code: 'INVALID_FILE_TYPE',
        message: 'Submit a JPEG, PNG or WebP image as multipart form field "image".',
        retryable: false,
      });
    }
    const contentLength = Number(request.headers.get('content-length'));
    const maxMultipartBytes = MAX_IMAGE_BYTES + 256 * 1024;
    const tooLarge = () => apiErrorResponse({
      code: 'FILE_TOO_LARGE',
      message: 'Choose an image no larger than 4 MiB.',
      retryable: false,
    });
    if (Number.isFinite(contentLength) && contentLength > maxMultipartBytes) return tooLarge();

    let form: FormData | null;
    try {
      form = await readBoundedForm(request, contentType, maxMultipartBytes);
    } catch {
      return apiErrorResponse({ code: 'UNREADABLE_IMAGE', message: 'The uploaded image could not be read.', retryable: false });
    }
    if (!form) return tooLarge();
    const image = form.get('image');
    if (!(image instanceof File)) {
      return apiErrorResponse({ code: 'UNREADABLE_IMAGE', message: 'The image field is missing or unreadable.', retryable: false });
    }
    if (image.size === 0) {
      return apiErrorResponse({ code: 'UNREADABLE_IMAGE', message: 'The uploaded image is empty.', retryable: false });
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
      const lookupResult: unknown = await dependencies.lookupMedicine(extracted.nafdacNumber!.trim());
      if (!isReferenceLookupResult(lookupResult)) {
        throw new AnalysisApiError({
          code: 'SERVICE_UNAVAILABLE',
          message: 'The registration source returned an invalid response.',
          retryable: true,
        });
      }
      reference = lookupResult;
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
