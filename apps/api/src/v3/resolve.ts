import type { IdentityLevel, ResolveResponse, ResultWarning } from '@counterfeitiq/shared/v3';
import { apiErrorResponse } from '../routes/errors';
import { simulatedErp, type ErpAdapter } from './erp';
import { parseIdentifier, type ParsedIdentifier } from './identifier';
import { isolateScanEvents, type ScanEventStore } from './scanEvents';

const MAX_BODY_BYTES = 2048;
const MAX_IDENTIFIER_LENGTH = 256;
const ERP_TIMEOUT_MS = 8_000;

export interface ResolveDependencies {
  erp?: ErpAdapter;
  scanEvents?: ScanEventStore;
  now?: () => Date;
}

function badRequest(message: string): Response {
  return apiErrorResponse({ code: 'SERVICE_UNAVAILABLE', message, retryable: false }, 400);
}

function withTimeout<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('timed out')), ERP_TIMEOUT_MS);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

/** Compares year and month or a full date with today, and treats anything else as unknown. */
function hasPassed(date: string | null, now: Date): boolean {
  if (!date) return false;
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(date);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const end = match[3] ? new Date(Date.UTC(year, month - 1, Number(match[3]), 23, 59, 59)) : new Date(Date.UTC(year, month, 0, 23, 59, 59));
  return end.getTime() < now.getTime();
}

export async function resolveIdentifier(
  parsed: ParsedIdentifier,
  recordScan: boolean,
  anonymousSessionId: unknown,
  dependencies: ResolveDependencies = {},
): Promise<ResolveResponse> {
  const erp = dependencies.erp ?? simulatedErp;
  const scanEvents = dependencies.scanEvents ?? isolateScanEvents;
  const now = dependencies.now?.() ?? new Date();
  const retrievedAt = now.toISOString();

  const base = {
    identifier: parsed.normalized,
    identifierType: parsed.type,
    identityLevel: null,
    product: null,
    manufacturer: null,
    batch: null,
    pack: null,
    reference: null,
    scanSummary: null,
    warnings: [] as ResultWarning[],
    limitations: [] as string[],
  };
  const source = (status: ResolveResponse['source']['status']) => ({ type: erp.sourceType, name: erp.sourceName, status, retrievedAt });

  if (!parsed.gtin) {
    if (parsed.badCheckDigit) {
      base.warnings.push({ code: 'CHECK_DIGIT_FAILED', severity: 'INFO', message: 'This number fails the barcode check, so it may have been misread or mistyped.' });
    }
    return { ...base, source: source('NOT_FOUND') };
  }

  let record;
  try {
    record = await withTimeout(erp.findByGtin(parsed.gtin));
  } catch {
    // A failure says nothing about the product, so it can never be reported as "not found".
    return { ...base, source: source('UNAVAILABLE') };
  }
  if (!record) return { ...base, source: source('NOT_FOUND') };

  const warnings: ResultWarning[] = [];
  const pack = parsed.serial ? record.packs[parsed.serial] ?? null : null;
  if (parsed.serial && !pack) {
    warnings.push({ code: 'PACK_NOT_ON_RECORD', severity: 'WARNING', message: 'The manufacturer has this product on record, but not this serial number. Have the pack checked by a pharmacist.' });
  }
  if (pack && parsed.batch && pack.batchNumber !== parsed.batch) {
    warnings.push({ code: 'PACK_BATCH_MISMATCH', severity: 'HIGH', message: 'The manufacturer lists this serial number under a different batch from the one in this code. Have the pack checked by a pharmacist.' });
  }

  const batchNumber = parsed.batch ?? pack?.batchNumber ?? null;
  const batch = batchNumber ? record.batches[batchNumber] ?? null : null;
  if (parsed.batch && !batch) {
    warnings.push({ code: 'BATCH_NOT_ON_RECORD', severity: 'WARNING', message: 'The manufacturer has this product on record, but not this batch. Have the pack checked by a pharmacist.' });
  }
  if (batch?.status === 'Recalled') {
    warnings.push({ code: 'BATCH_RECALLED', severity: 'HIGH', message: 'The manufacturer lists this batch as recalled. Do not use this product until a pharmacist has checked it.' });
  }
  if (batch && hasPassed(batch.expiryDate, now)) {
    warnings.push({ code: 'BATCH_EXPIRED', severity: 'HIGH', message: 'The expiry date on record for this batch has passed. Do not use this product until a pharmacist has checked it.' });
  }
  if (parsed.expiry && batch?.expiryDate && `${parsed.expiry.slice(0, 2)}${parsed.expiry.slice(2, 4)}` !== batch.expiryDate.slice(2, 7).replace('-', '')) {
    warnings.push({ code: 'EXPIRY_MISMATCH', severity: 'WARNING', message: 'The expiry date in this code differs from the one on record. Have the pack checked by a pharmacist.' });
  }

  const identityLevel: IdentityLevel = pack ? 'PACK' : batch ? 'BATCH' : 'PRODUCT';
  const limitations = [
    identityLevel === 'PRODUCT' ? 'This code identifies the product type. Every pack of this product carries the same one.' : null,
    identityLevel === 'BATCH' ? 'This code identifies the batch, not one individual pack.' : null,
    'A record does not prove this pack is genuine, because a code can be copied.',
  ].filter((item): item is string => item !== null);

  const tracked = pack ? `${parsed.gtin}|${pack.serialNumber}` : batch ? `${parsed.gtin}|${batch.batchNumber}` : parsed.gtin;
  const scanSummary = recordScan
    ? scanEvents.record({ identifier: tracked, level: identityLevel, occurredAt: retrievedAt, anonymousSessionId })
    : null;

  return {
    ...base,
    identityLevel,
    product: record.product,
    manufacturer: record.manufacturer,
    batch,
    pack: pack ? { serialNumber: pack.serialNumber, status: pack.status } : null,
    scanSummary,
    warnings,
    limitations,
    source: source('FOUND'),
  };
}

export async function resolveRequest(request: Request, dependencies: ResolveDependencies = {}): Promise<Response> {
  if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) return badRequest('The request is too large.');
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) return badRequest('Send JSON.');

  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return badRequest('The request is too large.');
    body = JSON.parse(text);
  } catch {
    return badRequest('The request could not be read.');
  }
  if (typeof body !== 'object' || body === null) return badRequest('The request could not be read.');

  const { identifier, recordScan, anonymousSessionId } = body as Record<string, unknown>;
  if (typeof identifier !== 'string' || !identifier.trim() || identifier.length > MAX_IDENTIFIER_LENGTH) return badRequest('Enter a valid code.');

  return Response.json(await resolveIdentifier(parseIdentifier(identifier), recordScan === true, anonymousSessionId, dependencies));
}
