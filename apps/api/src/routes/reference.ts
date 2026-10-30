import type { MedicineReference, ReferenceLookupResult, ReferenceProvenance } from '@counterfeitiq/shared';
import { AnalysisApiError, apiErrorResponse, unexpectedApiErrorResponse } from './errors';

export interface ReferenceDependencies {
  lookupMedicine(number: string): Promise<ReferenceLookupResult>;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !Number.isNaN(Date.parse(value));
}

function isMedicineReference(value: unknown): value is MedicineReference {
  if (!isObject(value)) return false;
  return typeof value.productName === 'string'
    && typeof value.nafdacNumber === 'string'
    && (typeof value.manufacturer === 'string' || value.manufacturer === null)
    && (typeof value.strength === 'string' || value.strength === null)
    && Array.isArray(value.ingredients)
    && value.ingredients.every((ingredient) => typeof ingredient === 'string')
    && (typeof value.registrationExpiry === 'string' || value.registrationExpiry === null)
    && isIsoTimestamp(value.retrievedAt);
}

function isProvenance(value: unknown): value is ReferenceProvenance {
  if (!isObject(value)) return false;
  return ['NAFDAC_GREENBOOK', 'DEMO_FIXTURE', 'NONE'].includes(String(value.source))
    && ['LIVE_OFFICIAL', 'DEMO_FIXTURE', 'NOT_EXECUTED'].includes(String(value.mode))
    && typeof value.authoritative === 'boolean'
    && (isIsoTimestamp(value.requestedAt) || value.requestedAt === null)
    && (value.sourceUrl === undefined || typeof value.sourceUrl === 'string')
    && (value.note === undefined || typeof value.note === 'string');
}

export function isReferenceLookupResult(value: unknown): value is ReferenceLookupResult {
  if (!isObject(value) || !isProvenance(value.provenance)) return false;
  const provenance = value.provenance;
  const live = provenance.source === 'NAFDAC_GREENBOOK'
    && provenance.mode === 'LIVE_OFFICIAL'
    && provenance.authoritative === true
    && typeof provenance.requestedAt === 'string';
  const fixture = provenance.source === 'DEMO_FIXTURE'
    && provenance.mode === 'DEMO_FIXTURE'
    && provenance.authoritative === false
    && typeof provenance.requestedAt === 'string';

  if (value.status === 'FOUND') return isMedicineReference(value.record) && (live || fixture);
  if (value.status === 'NOT_FOUND') return value.record === null && live;
  if (value.status === 'SOURCE_UNAVAILABLE') {
    const notExecuted = provenance.source === 'NONE'
      && provenance.mode === 'NOT_EXECUTED'
      && provenance.requestedAt === null;
    const liveUnavailable = provenance.source === 'NAFDAC_GREENBOOK'
      && provenance.mode === 'LIVE_OFFICIAL'
      && isIsoTimestamp(provenance.requestedAt);
    const fixtureUnavailable = provenance.source === 'DEMO_FIXTURE'
      && provenance.mode === 'DEMO_FIXTURE'
      && isIsoTimestamp(provenance.requestedAt);
    return value.record === null
      && provenance.authoritative === false
      && (notExecuted || liveUnavailable || fixtureUnavailable);
  }
  return false;
}

export async function referenceRequest(
  request: Request,
  encodedNumber: string,
  dependencies: ReferenceDependencies,
): Promise<Response> {
  if (request.method !== 'GET') return new Response(null, { status: 405, headers: { Allow: 'GET' } });

  let number: string;
  try {
    number = decodeURIComponent(encodedNumber).trim();
  } catch {
    return apiErrorResponse({ code: 'SERVICE_UNAVAILABLE', message: 'The registration number is invalid.', retryable: false }, 400);
  }
  if (!number) {
    return apiErrorResponse({ code: 'SERVICE_UNAVAILABLE', message: 'A registration number is required.', retryable: false }, 400);
  }

  try {
    const result: unknown = await dependencies.lookupMedicine(number);
    if (!isReferenceLookupResult(result)) {
      throw new AnalysisApiError({
        code: 'SERVICE_UNAVAILABLE',
        message: 'The registration source returned an invalid response.',
        retryable: true,
      });
    }
    return Response.json(result);
  } catch (error) {
    if (error instanceof AnalysisApiError) return apiErrorResponse(error.detail);
    return unexpectedApiErrorResponse();
  }
}
