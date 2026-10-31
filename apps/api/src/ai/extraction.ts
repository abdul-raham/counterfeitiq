import type { ExtractedProduct } from '@counterfeitiq/shared';
import { AnalysisApiError } from '../routes/errors';
import { mockExtractedMedicine } from '../services/mocks';

export interface ExtractionOptions {
  apiKey?: string;
  apiUrl?: string;
  timeoutMs?: number;
}

/**
 * Extracts product claims from a packaging image.
 * Uses hosted Gemma vision API when configured, or transparent demo extraction.
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

  // If external Gemma endpoint and key are configured, execute vision request
  if (options.apiKey && options.apiUrl) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000);
    try {
      const buffer = await image.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), ''),
      );

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
                {
                  type: 'text',
                  text: 'Extract the product claims from this package photo in JSON format conforming to ExtractedProduct schema.',
                },
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

  // Demonstration fallback when no external API key is bound
  return mockExtractedMedicine;
}
