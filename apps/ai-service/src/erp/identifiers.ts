export type IdentityLevel = 'PRODUCT' | 'BATCH' | 'PACK';

export interface ParsedIdentifier {
  /** Always 14 digits. */
  gtin: string;
  batchNumber: string | null;
  serial: string | null;
  /** YYYY-MM-DD, or YYYY-MM when the code gives no day. */
  expiryDate: string | null;
  level: IdentityLevel;
}

const MAX_LENGTH = 256;
const GROUP_SEPARATOR = '\u001d';
const FIXED_LENGTHS: Record<string, number> = { '01': 14, '11': 6, '17': 6 };
const VARIABLE_VALUE = /^[\x21-\x7e]{1,20}$/;

export function validGtin(value: string): boolean {
  if (!/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(value)) return false;
  const sum = [...value].reverse().reduce((total, digit, index) => total + Number(digit) * (index % 2 === 1 ? 3 : 1), 0);
  return sum % 10 === 0;
}

function expiry(value: string | undefined): string | null {
  if (!value || !/^\d{6}$/.test(value)) return null;
  const month = Number(value.slice(2, 4));
  const day = Number(value.slice(4, 6));
  if (month < 1 || month > 12 || day > 31) return null;
  const yearMonth = `20${value.slice(0, 2)}-${value.slice(2, 4)}`;
  return day === 0 ? yearMonth : `${yearMonth}-${value.slice(4, 6)}`;
}

function fromElements(elements: Map<string, string>): ParsedIdentifier | null {
  const gtin = elements.get('01');
  const batch = elements.get('10') ?? null;
  const serial = elements.get('21') ?? null;
  if (!gtin || !validGtin(gtin)) return null;
  if ((batch && !VARIABLE_VALUE.test(batch)) || (serial && !VARIABLE_VALUE.test(serial))) return null;
  return {
    gtin: gtin.padStart(14, '0'),
    batchNumber: batch,
    serial,
    expiryDate: expiry(elements.get('17')),
    // A plain GTIN names a trade item. Only a serial number identifies one pack.
    level: serial ? 'PACK' : batch ? 'BATCH' : 'PRODUCT',
  };
}

function bracketed(text: string): Map<string, string> | null {
  const elements = new Map<string, string>();
  for (const [, ai, value] of text.matchAll(/\((\d{2})\)([^(]*)/g)) {
    if (ai && value) elements.set(ai, value.trim());
  }
  return elements.size ? elements : null;
}

function digitalLink(text: string): Map<string, string> | null {
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const segments = url.pathname.split('/').filter(Boolean);
  const start = segments.indexOf('01');
  if (start < 0) return null;
  const elements = new Map<string, string>();
  try {
    for (let index = start; index + 1 < segments.length; index += 2) {
      elements.set(segments[index]!, decodeURIComponent(segments[index + 1]!));
    }
    for (const [key, value] of url.searchParams) elements.set(key, value);
  } catch {
    return null;
  }
  return elements;
}

/** Unbracketed form, as a scanner returns from a GS1 DataMatrix. */
function elementString(text: string): Map<string, string> | null {
  const elements = new Map<string, string>();
  let rest = text;
  while (rest) {
    if (rest.startsWith(GROUP_SEPARATOR)) {
      rest = rest.slice(1);
      continue;
    }
    const ai = rest.slice(0, 2);
    const fixed = FIXED_LENGTHS[ai];
    if (fixed) {
      if (rest.length < 2 + fixed) return null;
      elements.set(ai, rest.slice(2, 2 + fixed));
      rest = rest.slice(2 + fixed);
    } else if (ai === '10' || ai === '21') {
      const end = rest.indexOf(GROUP_SEPARATOR);
      elements.set(ai, end < 0 ? rest.slice(2) : rest.slice(2, end));
      rest = end < 0 ? '' : rest.slice(end + 1);
    } else {
      return null;
    }
  }
  return elements;
}

/** Returns null for anything that is not clearly a GS1 identifier. Nothing is guessed. */
export function parseIdentifier(input: string): ParsedIdentifier | null {
  const text = input.trim().replace(/^\](?:d2|Q3|C1)/, '');
  if (!text || text.length > MAX_LENGTH) return null;
  if (/^\d+$/.test(text) && text.length <= 14) {
    return validGtin(text) ? fromElements(new Map([['01', text]])) : null;
  }
  const elements = text.startsWith('(') ? bracketed(text)
    : /^https?:/i.test(text) ? digitalLink(text)
      : elementString(text);
  return elements && fromElements(elements);
}
