export type ExpiryStatus = 'EXPIRED' | 'NOT_EXPIRED' | 'UNKNOWN';

function expiryBoundary(value: string | null): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  const monthFirst = /^(\d{2})\/(\d{4})$/.exec(trimmed);
  const normalized = monthFirst ? `${monthFirst[2]}-${monthFirst[1]}` : trimmed;
  const match = /^(\d{4})-(\d{2})(?:-(\d{2})(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?)?$/.exec(normalized);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = match[3] ? Number(match[3]) : new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const boundary = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
  if (boundary.getUTCFullYear() !== year || boundary.getUTCMonth() !== month - 1 || boundary.getUTCDate() !== day) {
    return null;
  }
  return boundary;
}

function assess(value: string | null, now: Date): ExpiryStatus {
  const boundary = expiryBoundary(value);
  if (!boundary || Number.isNaN(now.getTime())) return 'UNKNOWN';
  return boundary.getTime() < now.getTime() ? 'EXPIRED' : 'NOT_EXPIRED';
}

export function assessPackageExpiry(value: string | null, now = new Date()): ExpiryStatus {
  return assess(value, now);
}

export function assessRegistrationExpiry(value: string | null, now = new Date()): ExpiryStatus {
  return assess(value, now);
}
