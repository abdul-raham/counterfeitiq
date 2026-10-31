import type { ProductReport } from './contract';

const OUTCOMES = ['RESOLVED', 'NOT_FOUND', 'SOURCE_UNAVAILABLE', 'INVALID_IDENTIFIER'];
const LEVELS = ['PRODUCT', 'BATCH', 'PACK', 'UNRESOLVED'];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// A record's sources decide how it is labelled, so a reply with no recognisable sources, a
// claim of authenticity, or a "resolved" with no product is refused rather than displayed.
export function isProductReport(value: unknown): value is ProductReport {
  if (!isObject(value) || value.physicalAuthenticityConfirmed !== false) return false;
  if (!OUTCOMES.includes(value.outcome as string) || !LEVELS.includes(value.identityLevel as string)) return false;
  if (typeof value.explanation !== 'string' || typeof value.notice !== 'string') return false;
  if (!isObject(value.identifier)) return false;
  if (!Array.isArray(value.sources) || !value.sources.every((source) => isObject(source) && typeof source.sourceName === 'string' && typeof source.isDemo === 'boolean')) return false;
  if (!Array.isArray(value.warnings) || !value.warnings.every((warning) => isObject(warning) && typeof warning.code === 'string' && typeof warning.explanation === 'string')) return false;

  const { product, batch, pack, scanSignal } = value;
  if (value.outcome === 'RESOLVED') {
    if (!isObject(product) || typeof product.productName !== 'string' || !Array.isArray(product.ingredients) || value.sources.length === 0) return false;
  } else if (product !== null) {
    return false;
  }
  if (batch !== null && !(isObject(batch) && typeof batch.batchNumber === 'string')) return false;
  if (pack !== null && !(isObject(pack) && typeof pack.serial === 'string')) return false;
  return scanSignal === null || (isObject(scanSignal) && typeof scanSignal.totalScans === 'number' && typeof scanSignal.firstSeenAt === 'string');
}

const MAX_IDENTIFIER_LENGTH = 256;

/**
 * Tidies scanned or typed text for the server, which does the real parsing. Scanners can start a
 * GS1 code with a GS character, which is a marker and not data. GS may remain inside a code, as
 * the separator GS1 uses. A scanned web address stays text, so a code can't send anyone to a site.
 */
export function cleanIdentifier(raw: string): string | null {
  // eslint-disable-next-line no-control-regex
  const text = raw.trim().replace(/^\u001d+/, '');
  if (text.length < 4 || text.length > MAX_IDENTIFIER_LENGTH) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001c\u001e-\u001f\u007f]/.test(text)) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(text) && !/^https?:\/\//i.test(text)) return null;
  return text;
}
