function normalizeText(value: string | null): string | null {
  if (!value?.trim()) return null;
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[.,()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const NAME_DOSAGE = /\d[\d.,]*\s*(?:µg|μg|mcg|mg|g|ml|iu)\b(?:\s*\/\s*\d[\d.,]*\s*(?:ml|l)\b)?/g;
const NAME_QUALIFIER = /\([^)]*\)/g;
const NAME_FORM = /\b(?:tablet|capsule|caplet|syrup|suspension|injection|cream|ointment)s?\b/g;

function joinHyphenated(value: string): string {
  return value.replace(/(\w)-(\w)/g, '$1$2');
}

// Dosages are matched before punctuation is removed, because removing it first
// would turn "2.5 mg" into "2 5 mg" and leave a stray number in the name.
export function normalizeProductName(value: string | null): string | null {
  if (!value?.trim()) return null;
  const withoutDetails = value
    .normalize('NFKC')
    .toLowerCase()
    .replace(NAME_QUALIFIER, ' ')
    .replace(NAME_DOSAGE, ' ')
    .replace(NAME_FORM, ' ');
  const normalized = normalizeText(withoutDetails);
  return normalized ? joinHyphenated(normalized) : null;
}

function nameDetails(value: string, pattern: RegExp, canonical: (detail: string) => string): string[] {
  const details = value.normalize('NFKC').toLowerCase().match(pattern) ?? [];
  // A standalone volume such as "100ml" is the pack size, not the strength.
  return [...new Set(details.map(canonical))].filter((detail) => !/^[\d.]+ml$/.test(detail)).sort();
}

// Dosage and form are ignored when only one name states them, since the base name
// can still match. When both names state one, a difference is a real discrepancy.
export function productNamesConflict(first: string | null, second: string | null): boolean {
  if (!first || !second) return false;
  const differ = (pattern: RegExp, canonical: (detail: string) => string) => {
    const a = nameDetails(first, pattern, canonical);
    const b = nameDetails(second, pattern, canonical);
    return a.length > 0 && b.length > 0 && a.join('|') !== b.join('|');
  };
  return differ(NAME_DOSAGE, (dosage) => normalizeStrength(dosage) ?? dosage)
    || differ(NAME_FORM, (form) => form.replace(/s$/, ''))
    || differ(NAME_QUALIFIER, (qualifier) => qualifier);
}

export function normalizeNafdacNumber(value: string | null): string | null {
  if (!value?.trim()) return null;
  const normalized = value.normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return normalized || null;
}

export function normalizeManufacturer(value: string | null): string | null {
  const normalized = normalizeText(value)
    ?.replace(/\bltd\b/g, 'limited')
    .replace(/\b(?:pharm|pharmaceuticals?)\b/g, 'pharma')
    .replace(/\bnig\b/g, 'nigeria')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized || null;
}

function convertUnit(value: string, unit: RegExp, factor: number): string {
  return value.replace(unit, (match, amount: string) => {
    const milligrams = Number((Number(amount) * factor).toFixed(6));
    return Number.isFinite(milligrams) ? `${milligrams}mg` : match;
  });
}

export function normalizeStrength(value: string | null): string | null {
  if (!value?.trim()) return null;
  const normalized = value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/(\d),(?=\d{3}(?!\d))/g, '$1')
    .replace(/mcg|μg|µg/g, 'µg')
    .replace(/\bper\s+(tablets?|capsules?|caplets?|doses?)\b/g, '')
    .replace(/\s*\/\s*(tablets?|capsules?|caplets?|doses?)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(\d)\s+(mg|g|kg|ml|l|µg|iu)\b/g, '$1$2')
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s*\+\s*/g, '+');
  const canonical = convertUnit(
    convertUnit(normalized, /(\d+(?:\.\d+)?)g\b/g, 1000),
    /(\d+(?:\.\d+)?)µg\b/g,
    0.001,
  );
  return canonical || null;
}

export function normalizeIngredient(value: string): string {
  const normalized = joinHyphenated(normalizeText(value) ?? '');
  return normalized.replace(/\bparacetamol\b/g, 'acetaminophen');
}
