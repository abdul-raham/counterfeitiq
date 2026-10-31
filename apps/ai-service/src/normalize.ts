import { normalizeManufacturer, normalizeStrength } from '../../api/src/services/normalize';

export type Comparison = 'MATCH' | 'MISMATCH' | 'UNKNOWN';

interface StrengthPart { key: string; perVolume: boolean }

const STRENGTH_PART = /(\d+(?:\.\d+)?)(mg|iu|%)(?:\/(\d+(?:\.\d+)?)?(ml|l)\b)?/g;

function strengthParts(value: string): StrengthPart[] | null {
  const normalized = normalizeStrength(value);
  if (!normalized) return null;
  const parts: StrengthPart[] = [];
  for (const [, amount, unit, volume, volumeUnit] of normalized.matchAll(STRENGTH_PART)) {
    const millilitres = volumeUnit ? Number(volume ?? 1) * (volumeUnit === 'l' ? 1000 : 1) : 0;
    if (volumeUnit && !millilitres) return null;
    const concentration = millilitres ? Number((Number(amount) / millilitres).toFixed(6)) : Number(amount);
    parts.push({ key: `${concentration}${unit}${millilitres ? '/ml' : ''}`, perVolume: Boolean(millilitres) });
  }
  // Text left over means the value was not fully understood, so nothing can be concluded.
  const remainder = normalized.replace(STRENGTH_PART, '').replace(/[+/,&\s]|\band\b/g, '');
  return parts.length && !remainder ? parts : null;
}

/** 125 mg/5 ml equals 25 mg/ml, and component order is ignored. Unclear values stay UNKNOWN. */
export function compareStrengths(first: string | null, second: string | null): Comparison {
  if (!first || !second) return 'UNKNOWN';
  const a = strengthParts(first);
  const b = strengthParts(second);
  if (!a || !b) return 'UNKNOWN';
  const aKeys = new Set(a.map((part) => part.key));
  const bKeys = new Set(b.map((part) => part.key));
  if (aKeys.size === bKeys.size && [...aKeys].every((key) => bKeys.has(key))) return 'MATCH';
  if (a.some((part) => part.perVolume) !== b.some((part) => part.perVolume)) return 'UNKNOWN';
  // One list inside the other is usually an incomplete label, not a different product.
  const subset = [...aKeys].every((key) => bKeys.has(key)) || [...bKeys].every((key) => aKeys.has(key));
  return subset ? 'UNKNOWN' : 'MISMATCH';
}

const FORM_FAMILIES: [RegExp, string][] = [
  [/\b(?:tablet|caplet)s?\b/, 'tablet'],
  [/\bcapsules?\b/, 'capsule'],
  [/\b(?:syrup|suspension|solution|elixir|linctus)s?\b/, 'liquid'],
  [/\b(?:injection|injectable|infusion|vaccine)s?\b/, 'injection'],
  [/\b(?:cream|ointment|gel|lotion)s?\b/, 'topical'],
];

function formFamily(value: string): string | null {
  const text = value.toLowerCase();
  return FORM_FAMILIES.find(([pattern]) => pattern.test(text))?.[1] ?? null;
}

export function compareDosageForms(first: string | null, second: string | null): Comparison {
  const a = first ? formFamily(first) : null;
  const b = second ? formFamily(second) : null;
  if (!a || !b) return 'UNKNOWN';
  return a === b ? 'MATCH' : 'MISMATCH';
}

const GENERIC_COMPANY_WORDS = new Set([
  'limited', 'plc', 'inc', 'co', 'company', 'nigeria', 'pharma', 'industries', 'industry',
  'laboratories', 'laboratory', 'labs', 'lab', 'group', 'and', 'of',
]);

function companyWords(value: string): string[] {
  return (normalizeManufacturer(value) ?? '').split(' ').filter((word) => word && !GENERIC_COMPANY_WORDS.has(word));
}

/** "Fictional Labs" and "Fictional Medical Laboratories Ltd" may be one company, so they are UNKNOWN. */
export function compareManufacturers(first: string | null, second: string | null): Comparison {
  if (!first || !second) return 'UNKNOWN';
  if (normalizeManufacturer(first) === normalizeManufacturer(second)) return 'MATCH';
  const a = companyWords(first);
  const b = companyWords(second);
  if (!a.length || !b.length) return 'UNKNOWN';
  const contained = (x: string[], y: string[]) => x.every((word) => y.includes(word));
  if (contained(a, b) && contained(b, a)) return 'MATCH';
  return contained(a, b) || contained(b, a) ? 'UNKNOWN' : 'MISMATCH';
}
