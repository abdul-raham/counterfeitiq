import type { MedicineReference, VerificationFinding, VerificationStatus } from '@counterfeitiq/shared';
import { compareFields, overallStatus } from '../compare';
import { NOTICE, type Extraction } from '../contract';
import { connectorFor, notAttempted, type ErpConnector, type ProductIdentity, type Provenance } from './types';
import { parseIdentifier } from './identifiers';

export interface ErpComparison {
  status: VerificationStatus;
  findings: VerificationFinding[];
  packagingNotes: { code: string; severity: 'WARNING'; explanation: string }[];
  sources: Provenance[];
  physicalAuthenticityConfirmed: false;
  notice: string;
}

function asReference(product: ProductIdentity, retrievedAt: string): MedicineReference {
  return {
    productName: product.productName,
    nafdacNumber: product.nafdacNumber ?? '',
    manufacturer: product.manufacturer,
    strength: product.strength,
    ingredients: product.ingredients,
    registrationExpiry: null,
    retrievedAt,
    dosageForm: product.dosageForm,
  };
}

/** Compares what the photo shows with the manufacturer's record. No model runs here. */
export async function comparePackagingWithErp(
  extraction: Extraction,
  identifier: string,
  connectors: readonly ErpConnector[],
): Promise<ErpComparison> {
  const respond = (status: VerificationStatus, sources: Provenance[], findings: VerificationFinding[] = [], packagingNotes: ErpComparison['packagingNotes'] = []): ErpComparison => ({
    status, findings, packagingNotes, sources, physicalAuthenticityConfirmed: false, notice: NOTICE,
  });

  const parsed = parseIdentifier(identifier);
  const connector = parsed && connectorFor(connectors, parsed.gtin);
  if (!parsed || !connector) return respond('REFERENCE_UNAVAILABLE', [notAttempted('No connected source')]);

  const product = await connector.getProduct(parsed.gtin);
  if (product.status === 'NOT_FOUND') return respond('RECORD_NOT_FOUND', [product.provenance]);
  if (!product.data) return respond('REFERENCE_UNAVAILABLE', [product.provenance]);

  const findings = compareFields(extraction, asReference(product.data, product.provenance.retrievedAt ?? ''));
  const sources = [product.provenance];
  const notes: ErpComparison['packagingNotes'] = [];
  const printedBatch = extraction.fields.batchNumber.value;
  if (printedBatch) {
    const batch = await connector.getBatch(parsed.gtin, printedBatch);
    sources.push(batch.provenance);
    if (batch.status === 'NOT_FOUND') notes.push({ code: 'PRINTED_BATCH_NOT_IN_RECORD', severity: 'WARNING', explanation: 'The batch printed on the pack is not in the source. It may have been misread, or the source may be incomplete.' });
    if (batch.data?.status === 'RECALLED' || batch.data?.status === 'BLOCKED') {
      notes.push({ code: `PRINTED_BATCH_${batch.data.status}`, severity: 'WARNING', explanation: "The manufacturer's record restricts the batch printed on this pack." });
    }
  }
  return respond(overallStatus(findings), sources, findings, notes);
}
