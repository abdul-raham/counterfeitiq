import type { ReferenceLookupResult } from '@counterfeitiq/shared';
import { assessPackageExpiry } from '../../../api/src/services/expiry';
import { NOTICE } from '../contract';
import type { ReferenceSource } from '../sources';
import { parseIdentifier, type IdentityLevel } from './identifiers';
import { hashKey, type ScanSignal, type ScanStore } from './scan-store';
import {
  connectorFor,
  notAttempted,
  type BatchIdentity,
  type ErpConnector,
  type PackIdentity,
  type ProductIdentity,
  type Provenance,
} from './types';

export type ScanOutcome = 'RESOLVED' | 'NOT_FOUND' | 'SOURCE_UNAVAILABLE' | 'INVALID_IDENTIFIER';

export interface ScanWarning {
  code: string;
  explanation: string;
}

export interface ProductReport {
  outcome: ScanOutcome;
  /** PRODUCT never refers to one physical pack, so repeat scans mean nothing at that level. */
  identityLevel: IdentityLevel | 'UNRESOLVED';
  identifier: { gtin: string | null; batchNumber: string | null; serial: string | null; printedExpiryDate: string | null };
  product: ProductIdentity | null;
  batch: BatchIdentity | null;
  pack: PackIdentity | null;
  registrationReference: ReferenceLookupResult['record'];
  /** Only for a serialized pack the source knows. A signal that needs context, not a finding. */
  scanSignal: ScanSignal | null;
  warnings: ScanWarning[];
  explanation: string;
  sources: Provenance[];
  physicalAuthenticityConfirmed: false;
  notice: string;
}

export interface ResolveDependencies {
  connectors: readonly ErpConnector[];
  /** Separate from the ERP: a registration record is not a manufacturer record. */
  referenceFor(connector: ErpConnector): ReferenceSource;
  scans: ScanStore | null;
  deviceId?: string | null;
  now?: () => Date;
}

const NOT_EVIDENCE = 'This is not evidence of counterfeiting.';

function referenceProvenance(result: ReferenceLookupResult): Provenance {
  const { source, requestedAt } = result.provenance;
  return {
    sourceType: source === 'DEMO_FIXTURE' ? 'DEMO_REFERENCE_FIXTURE' : source === 'NAFDAC_GREENBOOK' ? 'NAFDAC_PUBLIC_REFERENCE' : 'NONE',
    sourceName: source === 'DEMO_FIXTURE' ? 'Fictional demo reference' : source === 'NAFDAC_GREENBOOK' ? 'NAFDAC Greenbook (public site, not an authorized integration)' : 'None',
    retrievalStatus: result.status === 'FOUND' ? 'RETRIEVED' : result.status === 'NOT_FOUND' ? 'NOT_FOUND'
      : result.provenance.mode === 'NOT_EXECUTED' ? 'NOT_ATTEMPTED' : 'UNAVAILABLE',
    retrievedAt: requestedAt,
    dataAsOf: result.record?.retrievedAt ?? null,
    isDemo: source === 'DEMO_FIXTURE',
    unavailableFields: [],
  };
}

function batchWarnings(batch: BatchIdentity, now: Date): ScanWarning[] {
  const warnings: ScanWarning[] = [];
  if (batch.status === 'RECALLED') warnings.push({ code: 'BATCH_RECALLED', explanation: "The manufacturer's record lists this batch as recalled. Do not use it, and speak to a pharmacist." });
  if (batch.status === 'BLOCKED') warnings.push({ code: 'BATCH_BLOCKED', explanation: "The manufacturer's record lists this batch as blocked. Speak to a pharmacist before use." });
  if (batch.status === 'UNKNOWN') warnings.push({ code: 'BATCH_STATUS_UNKNOWN', explanation: 'The source gives no status for this batch, which is not the same as an all-clear.' });
  if (assessPackageExpiry(batch.expiryDate, now) === 'EXPIRED') warnings.push({ code: 'BATCH_EXPIRED', explanation: "The batch expiry date in the manufacturer's record has passed." });
  return warnings;
}

export async function resolveIdentifier(input: string, deps: ResolveDependencies): Promise<ProductReport> {
  const now = deps.now?.() ?? new Date();
  const parsed = parseIdentifier(input);
  const report = (fields: Partial<ProductReport> & Pick<ProductReport, 'outcome' | 'explanation'>): ProductReport => ({
    identityLevel: parsed?.level ?? 'UNRESOLVED',
    identifier: {
      gtin: parsed?.gtin ?? null, batchNumber: parsed?.batchNumber ?? null,
      serial: parsed?.serial ?? null, printedExpiryDate: parsed?.expiryDate ?? null,
    },
    product: null, batch: null, pack: null, registrationReference: null, scanSignal: null,
    warnings: [], sources: [], physicalAuthenticityConfirmed: false, notice: NOTICE,
    ...fields,
  });

  if (!parsed) {
    return report({ outcome: 'INVALID_IDENTIFIER', explanation: 'This is not a readable product code. Try scanning again.' });
  }

  const connector = connectorFor(deps.connectors, parsed.gtin);
  if (!connector) {
    return report({
      outcome: 'SOURCE_UNAVAILABLE',
      explanation: `No manufacturer source is connected for this product. ${NOT_EVIDENCE}`,
      sources: [notAttempted('No connected source')],
    });
  }

  const product = await connector.getProduct(parsed.gtin);
  const sources = [product.provenance];
  if (product.status === 'NOT_FOUND') {
    return report({ outcome: 'NOT_FOUND', sources, explanation: `The connected source has no product with this code. ${NOT_EVIDENCE}` });
  }
  if (product.status !== 'FOUND' || !product.data) {
    return report({ outcome: 'SOURCE_UNAVAILABLE', sources, explanation: `The manufacturer source could not answer. ${NOT_EVIDENCE}` });
  }

  const warnings: ScanWarning[] = [];
  let pack: PackIdentity | null = null;
  let packKnown = false;
  if (parsed.serial) {
    const lookup = await connector.getPack(parsed.gtin, parsed.serial);
    sources.push(lookup.provenance);
    pack = lookup.data;
    packKnown = lookup.status === 'FOUND';
    if (lookup.status === 'NOT_FOUND') warnings.push({ code: 'SERIAL_NOT_FOUND', explanation: `The source has no pack with this serial number. ${NOT_EVIDENCE}` });
    if (lookup.status === 'SOURCE_UNAVAILABLE' || lookup.status === 'UNSUPPORTED') warnings.push({ code: 'PACK_DATA_UNAVAILABLE', explanation: 'Pack details could not be retrieved.' });
    if (pack?.status === 'BLOCKED') warnings.push({ code: 'PACK_BLOCKED', explanation: "The manufacturer's record lists this pack as blocked." });
    if (pack?.batchNumber && parsed.batchNumber && pack.batchNumber !== parsed.batchNumber) {
      warnings.push({ code: 'BATCH_DIFFERS_FROM_PACK_RECORD', explanation: 'The batch in the code differs from the batch recorded for this pack.' });
    }
  }

  let batch: BatchIdentity | null = null;
  const batchNumber = parsed.batchNumber ?? pack?.batchNumber ?? null;
  if (batchNumber) {
    const lookup = await connector.getBatch(parsed.gtin, batchNumber);
    sources.push(lookup.provenance);
    batch = lookup.data;
    if (batch) warnings.push(...batchWarnings(batch, now));
    else warnings.push({ code: 'BATCH_DATA_UNAVAILABLE', explanation: 'Batch details could not be confirmed from the source.' });
    if (batch?.expiryDate && parsed.expiryDate && !batch.expiryDate.startsWith(parsed.expiryDate)) {
      warnings.push({ code: 'EXPIRY_DIFFERS_FROM_BATCH_RECORD', explanation: 'The expiry date in the code differs from the batch record.' });
    }
  }

  let registrationReference: ReferenceLookupResult['record'] = null;
  if (product.data.nafdacNumber) {
    const lookup = await deps.referenceFor(connector).lookup(product.data.nafdacNumber);
    sources.push(referenceProvenance(lookup));
    registrationReference = lookup.record;
  }

  let scanSignal: ScanSignal | null = null;
  if (packKnown && parsed.serial && deps.scans) {
    try {
      const packKey = await hashKey(`${parsed.gtin}:${parsed.serial}`);
      const deviceKey = deps.deviceId ? await hashKey(`device:${deps.deviceId}`) : null;
      scanSignal = await deps.scans.record(packKey, deviceKey, now.toISOString());
    } catch {
      // The report still stands without history.
      warnings.push({ code: 'SCAN_HISTORY_UNAVAILABLE', explanation: 'Scan history is unavailable right now.' });
    }
  }

  return report({
    outcome: 'RESOLVED', product: product.data, batch, pack, registrationReference, scanSignal, warnings, sources,
    explanation: parsed.level === 'PRODUCT'
      ? 'This code identifies a product, not one physical pack.'
      : parsed.level === 'BATCH' ? 'This code identifies a product and batch, not one physical pack.'
        : 'This code carries a serial number for one pack.',
  });
}
