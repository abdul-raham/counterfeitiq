import { ACCEPTED_IMAGE_TYPES, type AcceptedImageType, type ExtractedProduct } from '@counterfeitiq/shared';
import { AnalysisApiError } from '../routes/errors';

/** The part of the Workers AI binding this module uses. */
export interface VisionModel {
  run(model: string, input: unknown): Promise<unknown>;
}

export interface ExtractionOptions {
  ai?: VisionModel;
  model?: string;
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
- Report only text you can read letter by letter. If the photo is too blurry, dark or distant for that, use null for every value and an empty array for ingredients.
- Never identify a product from its colours, layout or shape.
- If any character of the NAFDAC registration number is covered, blurred or uncertain, use null for nafdacNumber.
- If several different products are visible, describe only the most prominent one.
- Write dates as YYYY-MM-DD, or YYYY-MM when no day is printed. Use null if the date is ambiguous.`;

const TEXT_FIELDS = [
  'productName', 'brand', 'nafdacNumber', 'manufacturer', 'strength',
  'batchNumber', 'manufacturingDate', 'expiryDate',
] as const;
const CONTRACT_KEYS = new Set<string>(['category', 'ingredients', ...TEXT_FIELDS]);
const CATEGORIES = new Set(['medicine', 'food', 'cosmetic', 'other']);
const EMPTY_VALUES = new Set(['', 'null', 'none', 'n/a', 'na', 'unknown', 'not visible', 'unreadable', '-']);
const RATE_LIMIT_PATTERN = /\b(?:429|3036|3040|4006)\b|rate limit|too many requests|capacity|daily free allocation/i;
const FENCED_REPLY = /^```(?:json)?\s*\n([\s\S]*)\n```$/;

function malformedOutput(reason: string): AnalysisApiError {
  // The reason names the failed check. Reply text stays out of the logs.
  console.error('extraction_malformed', { reason });
  return new AnalysisApiError({
    code: 'SERVICE_UNAVAILABLE',
    message: 'The image model returned an invalid response. Please try again.',
    retryable: true,
  });
}

export function detectImageType(bytes: Uint8Array): AcceptedImageType | null {
  const starts = (...signature: number[]) => signature.every((byte, index) => bytes[index] === byte);
  if (starts(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  const webp = String.fromCharCode(...bytes.subarray(8, 12));
  if (starts(0x52, 0x49, 0x46, 0x46) && webp === 'WEBP') return 'image/webp';
  return null;
}

function toBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function cleanText(value: string | null): string | null {
  const text = value?.replace(/\s+/g, ' ').trim() ?? '';
  return EMPTY_VALUES.has(text.toLowerCase()) ? null : text;
}

/** Accepts the whole reply as contract JSON, optionally inside one code fence, and nothing looser. */
export function parseModelOutput(reply: string): ExtractedProduct {
  const trimmed = reply.trim();
  const json = FENCED_REPLY.exec(trimmed)?.[1] ?? trimmed;

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw malformedOutput('not_json');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw malformedOutput('not_object');

  const output = parsed as Record<string, unknown>;
  const keys = Object.keys(output);
  if (keys.length !== CONTRACT_KEYS.size || !keys.every((key) => CONTRACT_KEYS.has(key))) throw malformedOutput('wrong_keys');

  const isNullableText = (value: unknown): value is string | null => typeof value === 'string' || value === null;
  const { category, ingredients } = output;
  if (!isNullableText(category) || !TEXT_FIELDS.every((field) => isNullableText(output[field]))) throw malformedOutput('wrong_value_type');
  if (!Array.isArray(ingredients) || !ingredients.every((item) => typeof item === 'string')) throw malformedOutput('wrong_ingredients');

  const normalizedCategory = cleanText(category)?.toLowerCase() ?? null;
  if (normalizedCategory !== null && !CATEGORIES.has(normalizedCategory)) throw malformedOutput('unknown_category');

  const text = (field: (typeof TEXT_FIELDS)[number]) => cleanText(output[field] as string | null);
  return {
    category: normalizedCategory,
    productName: text('productName'),
    brand: text('brand'),
    nafdacNumber: text('nafdacNumber'),
    manufacturer: text('manufacturer'),
    strength: text('strength'),
    ingredients: ingredients.map(cleanText).filter((item): item is string => item !== null),
    batchNumber: text('batchNumber'),
    manufacturingDate: text('manufacturingDate'),
    expiryDate: text('expiryDate'),
  };
}

function replyText(result: unknown): string {
  const choice = (result as { choices?: { message?: { content?: unknown }; finish_reason?: unknown }[] } | null)
    ?.choices?.[0];
  const content = choice?.message?.content;
  if (typeof content !== 'string' || !content.trim() || choice?.finish_reason === 'length') throw malformedOutput('empty_or_truncated');
  return content;
}

async function runModel(ai: VisionModel, model: string, dataUri: string, timeoutMs: number): Promise<unknown> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new AnalysisApiError({
      code: 'MODEL_TIMEOUT',
      message: 'The image analysis model timed out. Please try again.',
      retryable: true,
    })), timeoutMs);
  });

  try {
    return await Promise.race([
      ai.run(model, {
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: EXTRACTION_PROMPT },
            { type: 'image_url', image_url: { url: dataUri } },
          ],
        }],
        max_tokens: 1000,
        temperature: 0,
        // With thinking on, the model spends the whole token budget on reasoning.
        chat_template_kwargs: { enable_thinking: false },
      }),
      timeout,
    ]);
  } catch (error) {
    if (error instanceof AnalysisApiError) throw error;
    const rateLimited = RATE_LIMIT_PATTERN.test(String(error));
    // Provider errors stay out of logs and responses: only the classification is recorded.
    console.error('extraction_failed', { kind: rateLimited ? 'rate_limited' : 'provider_error' });
    throw new AnalysisApiError(rateLimited
      ? { code: 'RATE_LIMITED', message: 'The vision model is rate-limited. Please try again shortly.', retryable: true }
      : { code: 'SERVICE_UNAVAILABLE', message: 'The vision model is temporarily unavailable.', retryable: true });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Extracts product claims from a packaging image with Gemma on Workers AI.
 * Without a model it fails: a product the photo does not show must never be reported.
 */
export async function extractProduct(image: Blob, options: ExtractionOptions = {}): Promise<ExtractedProduct> {
  if (image.size === 0) {
    throw new AnalysisApiError({ code: 'UNREADABLE_IMAGE', message: 'The uploaded image is empty.', retryable: false });
  }
  if (!options.ai || !options.model) {
    throw new AnalysisApiError({ code: 'SERVICE_UNAVAILABLE', message: 'Image analysis is not configured.', retryable: false });
  }

  const bytes = new Uint8Array(await image.arrayBuffer());
  const type = detectImageType(bytes);
  if (!type || (image.type && image.type !== type)) {
    throw new AnalysisApiError({
      code: 'INVALID_FILE_TYPE',
      message: `The file is not a valid ${ACCEPTED_IMAGE_TYPES.map((item) => item.slice(6).toUpperCase()).join(', ')} image.`,
      retryable: false,
    });
  }

  const result = await runModel(options.ai, options.model, `data:${type};base64,${toBase64(bytes)}`, options.timeoutMs ?? 30_000);
  return parseModelOutput(replyText(result));
}
