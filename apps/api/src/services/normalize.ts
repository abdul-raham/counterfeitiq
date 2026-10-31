function normalizeText(value: string | null): string | null {
  if (!value?.trim()) return null;
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[.,()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeProductName(value: string | null): string | null {
  const normalized = normalizeText(value)
    ?.replace(/\b\d+(?:\.\d+)?\s*(?:µg|μg|mcg|mg|g|ml|iu)(?:\s*\/\s*\d+(?:\.\d+)?\s*(?:ml|l))?\b/g, ' ')
    .replace(/\b(?:tablets?|capsules?|caplets?|syrups?|suspensions?|injections?|creams?|ointments?)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized || null;
}

export function normalizeNafdacNumber(value: string | null): string | null {
  if (!value?.trim()) return null;
  const normalized = value.normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return normalized || null;
}

export function normalizeManufacturer(value: string | null): string | null {
  const normalized = normalizeText(value)
    ?.replace(/\bltd\b/g, 'limited')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized || null;
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
  const canonical = normalized.replace(/(\d+(?:\.\d+)?)g\b/g, (_match, amount: string) => {
    const milligrams = Number(amount) * 1000;
    return Number.isFinite(milligrams) ? `${milligrams}mg` : _match;
  });
  return canonical || null;
}

export function normalizeIngredient(value: string): string {
  const normalized = normalizeText(value) ?? '';
  return normalized.replace(/\bparacetamol\b/g, 'acetaminophen');
}
