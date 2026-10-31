import type { MedicineReference, ReferenceLookupResult } from '@counterfeitiq/shared';
import { notExecuted } from '../../../api/src/adapters/contract';
import type { RateLimiter } from '../../../api/src/adapters/greenbook';
import { createReferenceAdapter } from '../../../api/src/adapters/reference';
import type { SourceCategory, SourceProvenance } from '../contract';
import { createDemoSource } from './demo';

export interface ProductQuery {
  productName: string | null;
  brandName: string | null;
}

export type SearchResult =
  | { supported: true; records: MedicineReference[]; provenance: SourceProvenance }
  | { supported: false; provenance: SourceProvenance };

/** Every reference provider implements this, so matching and comparison never name one. */
export interface ReferenceSource {
  lookup(nafdacNumber: string): Promise<ReferenceLookupResult>;
  search(query: ProductQuery): Promise<SearchResult>;
}

export interface SourceOptions {
  mode?: string;
  greenbookAccessBasis?: string;
  limiter?: RateLimiter;
  fetch?: typeof fetch;
  now?: () => Date;
}

function categoryOf(lookup: ReferenceLookupResult): SourceCategory {
  const { source, mode, authoritative } = lookup.provenance;
  if (source === 'DEMO_FIXTURE') return 'DEMO_FIXTURE';
  if (mode === 'NOT_EXECUTED') return 'NO_SOURCE';
  return authoritative ? 'LIVE_REGULATORY_REFERENCE' : 'SOURCE_UNAVAILABLE';
}

export function toProvenance(lookup: ReferenceLookupResult): SourceProvenance {
  const category = categoryOf(lookup);
  return {
    category,
    isDemo: category === 'DEMO_FIXTURE',
    officialIntegration: false,
    requestedAt: lookup.provenance.requestedAt,
    retrievedAt: lookup.record?.retrievedAt ?? null,
    sourceUrl: lookup.provenance.sourceUrl ?? null,
    note: lookup.provenance.note ?? null,
  };
}

export function createSource(options: SourceOptions = {}): ReferenceSource {
  const mode = options.mode?.trim().toLowerCase() || 'demo';
  if (mode === 'demo') return createDemoSource(options.now);

  // The existing adapter fails closed on an unknown mode or a missing access basis.
  const adapter = createReferenceAdapter({
    mode,
    greenbookAccessBasis: options.greenbookAccessBasis,
    greenbook: { limiter: options.limiter, fetch: options.fetch, now: options.now },
  });
  return {
    lookup: (nafdacNumber) => adapter.lookupMedicine(nafdacNumber),
    // The project's rule is exact registration numbers only, so no name query is sent.
    search: async () => ({
      supported: false,
      provenance: toProvenance(notExecuted('Product-name search is not available from this source. No request was sent.')),
    }),
  };
}
