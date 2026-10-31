import type { ExtractedProduct } from '@counterfeitiq/shared';
import { AnalysisApiError } from '../routes/errors';

export interface ExtractionOptions {
  apiKey?: string;
  apiUrl?: string;
  timeoutMs?: number;
}

export const EXTRACTION_PROMPT = `Read the text visible on this product packaging photo.
Reply with one JSON object and nothing else, using exactly these keys:
category, productName, brand, nafdacNumber, manufacturer, strength, ingredients, batchNumber, manufacturingDate, expiryDate.

Rules:
- category must be one of: medicine, food, cosmetic, other. Vaccines and herbal medicines are medicine.
- ingredients is an array of strings. Every other value is a string or null.
- Copy values exactly as printed. Never guess, infer or complete anything that is not clearly visible.
- Use null, or an empty array for ingredients, when a value is missing or unreadable.
- Write dates as YYYY-MM-DD, or YYYY-MM when no day is printed. Use null if the date is ambiguous.`;

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

/**
 * Extracts product claims from a packaging image using a hosted Gemma vision API.
 * Without one configured it fails: a product the photo does not show must never be reported.
 */
export async function extractProduct(
  image: Blob,
  options: ExtractionOptions = {},
): Promise<ExtractedProduct> {
  if (image.size === 0) {
    throw new AnalysisApiError({
      code: 'UNREADABLE_IMAGE',
      message: 'The uploaded image is empty.',
      retryable: false,
    });
  }

  if (!options.apiKey || !options.apiUrl) {
    throw new AnalysisApiError({
      code: 'SERVICE_UNAVAILABLE',
      message: 'Image analysis is not configured.',
      retryable: false,
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000);
  try {
    const base64 = toBase64(await image.arrayBuffer());

    const response = await fetch(options.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${options.apiKey}`,
      },
      body: JSON.stringify({
        model: 'gemma-3-27b-it',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: EXTRACTION_PROMPT },
              {
                type: 'image_url',
                image_url: { url: `data:${image.type || 'image/jpeg'};base64,${base64}` },
              },
            ],
          },
        ],
      }),
      signal: controller.signal,
    });

    if (response.status === 429) {
      throw new AnalysisApiError({
        code: 'RATE_LIMITED',
        message: 'The vision extraction model is currently rate-limited. Please try again shortly.',
        retryable: true,
      });
    }

    if (!response.ok) {
      throw new AnalysisApiError({
        code: 'SERVICE_UNAVAILABLE',
        message: 'The vision model service is temporarily unavailable.',
        retryable: true,
      });
    }

    const data = await response.json() as { choices?: [{ message?: { content?: string } }] };
    const content = data.choices?.[0]?.message?.content ?? '';
    const match = /\{[\s\S]*\}/.exec(content);
    if (!match) {
      throw new AnalysisApiError({
        code: 'UNREADABLE_IMAGE',
        message: 'Could not extract readable packaging text from the image.',
        retryable: false,
      });
    }
    return JSON.parse(match[0]) as ExtractedProduct;
  } catch (error) {
    if (error instanceof AnalysisApiError) throw error;
    if (controller.signal.aborted) {
      throw new AnalysisApiError({
        code: 'MODEL_TIMEOUT',
        message: 'The image analysis model timed out. Please try again.',
        retryable: true,
      });
    }
    throw new AnalysisApiError({
      code: 'SERVICE_UNAVAILABLE',
      message: 'Could not complete image extraction.',
      retryable: true,
    });
  } finally {
    clearTimeout(timeout);
  }
}
