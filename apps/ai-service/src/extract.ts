import { detectImageType } from '../../api/src/ai/extraction';
import { canonicalNafdacNumber } from '../../api/src/adapters/contract';
import { AnalysisApiError } from '../../api/src/routes/errors';
import {
  CATEGORIES,
  FIELD_NAMES,
  modelOutputSchema,
  type ExtractedField,
  type Extraction,
  type FieldName,
  type ModelOutput,
} from './contract';
import type { VisionProvider } from './provider';

export const EXTRACTION_PROMPT = `Read the text printed on this medicine packaging photo.
Reply with one JSON object and nothing else, in exactly this shape:
{"category":string|null,"imageQuality":"GOOD"|"POOR"|"UNREADABLE","fields":{"productName":F,"brandName":F,"manufacturer":F,"nafdacNumber":F,"strength":F,"dosageForm":F,"batchNumber":F,"manufacturingDate":F,"expiryDate":F,"gtin":F},"activeIngredients":[string],"otherClaims":[string]}
where each F is {"value":string|null,"evidence":string|null,"legibility":"CLEAR"|"UNCERTAIN"|null}.

Rules:
- category is one of: medicine, medical device, food, cosmetic, other. Vaccines and herbal medicines are medicine.
- value is copied as printed. evidence is the exact printed text it came from, at most 80 characters.
- legibility is CLEAR if you can read every character, UNCERTAIN if some characters are hard to read.
- If a field is not printed or cannot be read, keep its key and use null for value, evidence and legibility. Never guess, infer or complete anything.
- If the photo is too blurry, dark or distant to read letter by letter, set imageQuality to UNREADABLE and use null for every field.
- Never identify a product from its colours, layout or shape.
- brandName is the trade name. productName is the name of the product as printed, including a generic name if that is all there is.
- nafdacNumber is the NAFDAC registration number. If any character is covered, blurred or uncertain, use null for its value.
- gtin is the digits of a printed barcode number.
- Write manufacturingDate and expiryDate values as YYYY-MM-DD, or YYYY-MM when no day is printed. Keep the printed form in evidence. Use null for value if the date is ambiguous.
- activeIngredients lists only ingredients printed on the pack. otherClaims lists at most 10 other printed claims, such as storage conditions.
- If several different products are visible, describe only the most prominent one.
- Do not say whether the product is genuine, fake, safe or authentic.`;

const EMPTY_VALUES = new Set(['', 'null', 'none', 'n/a', 'na', 'unknown', 'not visible', 'unreadable', '-']);
const FENCED_REPLY = /^```(?:json)?\s*\n([\s\S]*)\n```$/;
const ISO_DATE = /^\d{4}-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?$/;
const DATE_FIELDS = new Set<FieldName>(['manufacturingDate', 'expiryDate']);
const CATEGORY_SET = new Set<string>(CATEGORIES);

function malformed(reason: string, paths: string[] = []): AnalysisApiError {
  // The reason names the failed check. Reply text stays out of the logs.
  console.error('extraction_malformed', { reason, paths });
  return new AnalysisApiError({
    code: 'SERVICE_UNAVAILABLE',
    message: 'The vision model returned an invalid response. Please try again.',
    retryable: true,
  });
}

function clean(value: string | null): string | null {
  const text = value?.replace(/\s+/g, ' ').trim() ?? '';
  return EMPTY_VALUES.has(text.toLowerCase()) ? null : text;
}

const compact = (value: string) => value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

function validGtin(value: string): boolean {
  const digits = value.replace(/\s/g, '');
  if (!/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(digits)) return false;
  const sum = [...digits].reverse().reduce((total, digit, index) => total + Number(digit) * (index % 2 === 1 ? 3 : 1), 0);
  return sum % 10 === 0;
}

function finalizeField(name: FieldName, raw: ModelOutput['fields'][FieldName], quality: ModelOutput['imageQuality']): ExtractedField {
  const value = clean(raw.value);
  const evidence = clean(raw.evidence);
  if (quality === 'UNREADABLE') return { value: null, evidence: null, legibility: 'NOT_VISIBLE' };
  if (!value) return { value: null, evidence, legibility: evidence ? 'UNCERTAIN' : 'NOT_VISIBLE' };

  if (DATE_FIELDS.has(name)) {
    if (!ISO_DATE.test(value)) return { value: null, evidence: evidence ?? value, legibility: 'UNCERTAIN' };
    return { value, evidence, legibility: raw.legibility === 'CLEAR' && evidence && quality === 'GOOD' ? 'CLEAR' : 'UNCERTAIN' };
  }

  // A value that is not in its own evidence was not simply read off the pack.
  const supported = evidence !== null && compact(evidence).includes(compact(value));
  const clear = raw.legibility === 'CLEAR' && quality === 'GOOD' && supported;

  if (name === 'nafdacNumber') {
    const number = canonicalNafdacNumber(value);
    return number && clear
      ? { value: number, evidence, legibility: 'CLEAR' }
      : { value: null, evidence: evidence ?? value, legibility: 'UNCERTAIN' };
  }
  if (name === 'gtin' && !validGtin(value)) return { value, evidence, legibility: 'UNCERTAIN' };
  return { value, evidence, legibility: clear ? 'CLEAR' : 'UNCERTAIN' };
}

/** Accepts the whole reply as schema-valid JSON, optionally in one code fence, and nothing looser. */
export function parseModelReply(reply: string): Extraction {
  const trimmed = reply.trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(FENCED_REPLY.exec(trimmed)?.[1] ?? trimmed);
  } catch {
    throw malformed('not_json');
  }
  const result = modelOutputSchema.safeParse(parsed);
  if (!result.success) {
    throw malformed('schema_mismatch', result.error.issues.map((issue) => `${issue.path.join('.')}:${issue.code}`));
  }
  const output = result.data;

  const category = clean(output.category)?.toLowerCase() ?? null;
  if (category !== null && !CATEGORY_SET.has(category)) throw malformed('unknown_category');

  const fields = Object.fromEntries(
    FIELD_NAMES.map((name) => [name, finalizeField(name, output.fields[name], output.imageQuality)]),
  ) as Extraction['fields'];
  const unreadable = output.imageQuality === 'UNREADABLE';
  const list = (items: string[]) => (unreadable ? [] : items.map(clean).filter((item): item is string => item !== null));

  return {
    category: unreadable ? null : category as Extraction['category'],
    imageQuality: output.imageQuality,
    fields,
    activeIngredients: list(output.activeIngredients),
    otherClaims: list(output.otherClaims),
    missingFields: FIELD_NAMES.filter((name) => fields[name].legibility === 'NOT_VISIBLE'),
    uncertainFields: FIELD_NAMES.filter((name) => fields[name].legibility === 'UNCERTAIN'),
  };
}

function toBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export async function extractPackaging(image: Blob, provider: VisionProvider): Promise<Extraction> {
  const bytes = new Uint8Array(await image.arrayBuffer());
  const type = detectImageType(bytes);
  if (!type || (image.type && image.type !== type)) {
    throw new AnalysisApiError({ code: 'INVALID_FILE_TYPE', message: 'The file is not a valid JPEG, PNG or WebP image.', retryable: false });
  }
  return parseModelReply(await provider.complete(EXTRACTION_PROMPT, `data:${type};base64,${toBase64(bytes)}`));
}
