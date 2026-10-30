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
  return normalizeText(value);
}

export function normalizeNafdacNumber(value: string | null): string | null {
  if (!value?.trim()) return null;
  const normalized = value.normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return normalized || null;
}

export function normalizeManufacturer(value: string | null): string | null {
  return normalizeText(value);
}

export function normalizeStrength(value: string | null): string | null {
  const normalized = normalizeText(value)
    ?.replace(/\bmcg\b/g, 'µg')
    .replace(/(\d)\s+(mg|g|kg|ml|l|µg|iu)\b/g, '$1$2')
    .replace(/\s*\/\s*/g, '/');
  return normalized ?? null;
}

export function normalizeIngredient(value: string): string {
  return normalizeText(value) ?? '';
}
