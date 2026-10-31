import type { IdentifierType } from '@counterfeitiq/shared/v3';

export interface ParsedIdentifier {
  /** A readable, normalized form, used in responses. */
  normalized: string;
  type: IdentifierType;
  /** Always 14 digits, or null when this is not a valid GS1 identifier. */
  gtin: string | null;
  batch: string | null;
  serial: string | null;
  expiry: string | null;
  /** Digits that look like a barcode but fail its check digit, so it was probably misread. */
  badCheckDigit: boolean;
}

const GS = '\u001d';
const FIXED_LENGTH: Record<string, number> = { '01': 14, 11: 6, 15: 6, 17: 6 };
const VARIABLE = new Set(['10', '21']);
const LEADING_GS = new RegExp(`^${GS}+`);
const LEADING_MARKER = new RegExp(`^(?:\\]d2)?${GS}*`);

export function hasValidCheckDigit(digits: string): boolean {
  const body = digits.slice(0, -1);
  const sum = [...body].reverse().reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === Number(digits.at(-1));
}

function fromParts(parts: Map<string, string>, type: IdentifierType, raw: string): ParsedIdentifier {
  const gtin = parts.get('01') ?? null;
  if (!gtin || !/^\d{14}$/.test(gtin)) return unknown(raw);
  if (!hasValidCheckDigit(gtin)) return { ...unknown(raw), badCheckDigit: true };
  const batch = parts.get('10') ?? null;
  const serial = parts.get('21') ?? null;
  const expiry = parts.get('17') ?? null;
  const segments = [['01', gtin], ['10', batch], ['17', expiry], ['21', serial]].filter(([, value]) => value);
  return {
    normalized: segments.map(([ai, value]) => `(${ai})${value}`).join(''),
    type: serial || batch || expiry ? type : 'GTIN',
    gtin, batch, serial, expiry, badCheckDigit: false,
  };
}

function unknown(raw: string): ParsedIdentifier {
  return { normalized: raw, type: 'UNKNOWN', gtin: null, batch: null, serial: null, expiry: null, badCheckDigit: false };
}

function parseBracketed(text: string): Map<string, string> | null {
  if (!/^(?:\(\d{2}\)[^()]+)+$/.test(text)) return null;
  return new Map([...text.matchAll(/\((\d{2})\)([^()]+)/g)].map((match) => [match[1] as string, match[2] as string]));
}

function isValidFixedField(ai: string, value: string): boolean {
  if (ai === '01') return /^\d{14}$/.test(value);
  // Dates are YYMMDD, and a day of 00 means "end of month".
  return /^\d{2}(?:0[1-9]|1[0-2])(?:0\d|[12]\d|3[01])$/.test(value);
}

/**
 * Reads a GS1 element string, as found in a Data Matrix. GS ends a variable-length field, but
 * some scanners drop it, so without one the field's end is found by checking that everything
 * after it is itself valid. A batch that contains a valid-looking field can still be split
 * wrongly, which then shows as "not on record" rather than as a false match.
 */
function parseElementString(text: string, parts = new Map<string, string>()): Map<string, string> | null {
  if (text === '') return parts.size > 0 ? parts : null;
  const ai = text.slice(0, 2);
  if (parts.has(ai)) return null;

  const fixed = FIXED_LENGTH[ai];
  if (fixed !== undefined) {
    const value = text.slice(2, 2 + fixed);
    if (!isValidFixedField(ai, value)) return null;
    return parseElementString(text.slice(2 + fixed).replace(LEADING_GS, ''), new Map(parts).set(ai, value));
  }
  if (!VARIABLE.has(ai)) return null;

  const end = text.indexOf(GS);
  if (end !== -1) return parseElementString(text.slice(end + 1).replace(LEADING_GS, ''), new Map(parts).set(ai, text.slice(2, end)));

  for (let index = 3; index < text.length; index += 1) {
    const rest = parseElementString(text.slice(index), new Map(parts).set(ai, text.slice(2, index)));
    if (rest) return rest;
  }
  return text.length > 2 ? new Map(parts).set(ai, text.slice(2)) : null;
}

function parseDigitalLink(text: string): Map<string, string> | null {
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const segments = url.pathname.split('/').filter(Boolean);
  const start = segments.indexOf('01');
  if (start === -1) return null;
  const parts = new Map<string, string>();
  for (let index = start; index + 1 < segments.length; index += 2) {
    const ai = segments[index] as string;
    if (ai === '01' || VARIABLE.has(ai)) parts.set(ai, decodeURIComponent(segments[index + 1] as string));
  }
  const expiry = url.searchParams.get('17');
  if (expiry) parts.set('17', expiry);
  return parts;
}

export function parseIdentifier(input: string): ParsedIdentifier {
  // Scanners can mark a GS1 code with a leading GS or a ]d2 prefix, neither of which is data.
  const raw = input.trim().replace(LEADING_MARKER, '');

  if (/^\d{8}$|^\d{12,14}$/.test(raw)) {
    const gtin = raw.padStart(14, '0');
    if (!hasValidCheckDigit(gtin)) return { ...unknown(raw), badCheckDigit: true };
    return { normalized: raw, type: 'GTIN', gtin, batch: null, serial: null, expiry: null, badCheckDigit: false };
  }

  const bracketed = parseBracketed(raw);
  if (bracketed) return fromParts(bracketed, 'GS1_DATAMATRIX', raw);

  const link = parseDigitalLink(raw);
  if (link) return fromParts(link, 'SERIALIZED', raw);

  if (/^01\d{14}/.test(raw)) {
    const element = parseElementString(raw);
    if (element) return fromParts(element, 'GS1_DATAMATRIX', raw);
  }

  return unknown(raw);
}
