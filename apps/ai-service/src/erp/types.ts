export type SourceType =
  | 'SIMULATED_ERP'
  | 'MANUFACTURER_API'
  | 'NAFDAC_PUBLIC_REFERENCE'
  | 'DEMO_REFERENCE_FIXTURE'
  | 'NONE';

export type RetrievalStatus = 'RETRIEVED' | 'NOT_FOUND' | 'UNAVAILABLE' | 'UNSUPPORTED' | 'NOT_ATTEMPTED';

export interface Provenance {
  sourceType: SourceType;
  sourceName: string;
  retrievalStatus: RetrievalStatus;
  retrievedAt: string | null;
  /** When the source says its data was last current. */
  dataAsOf: string | null;
  isDemo: boolean;
  unavailableFields: string[];
}

export interface SourceResult<T> {
  status: 'FOUND' | 'NOT_FOUND' | 'UNSUPPORTED' | 'SOURCE_UNAVAILABLE';
  data: T | null;
  provenance: Provenance;
}

export interface ProductIdentity {
  gtin: string;
  productName: string;
  brand: string | null;
  manufacturer: string | null;
  nafdacNumber: string | null;
  strength: string | null;
  dosageForm: string | null;
  ingredients: string[];
  category: string | null;
  packSize: string | null;
  /** How many batches the source holds for this product. Null if it does not say. */
  batchCount: number | null;
}

export type BatchStatus = 'ACTIVE' | 'BLOCKED' | 'RECALLED' | 'UNKNOWN';

export interface BatchIdentity {
  gtin: string;
  batchNumber: string;
  manufacturingDate: string | null;
  expiryDate: string | null;
  status: BatchStatus;
}

export interface PackIdentity {
  gtin: string;
  serial: string;
  batchNumber: string | null;
  status: 'ACTIVE' | 'BLOCKED' | 'UNKNOWN';
}

export interface SourceStatus {
  available: boolean;
  capabilities: { batches: boolean; packs: boolean };
  provenance: Provenance;
}

/** Each manufacturer integration implements this. Nothing above it names a vendor. */
export interface ErpConnector {
  readonly sourceName: string;
  readonly sourceType: 'SIMULATED_ERP' | 'MANUFACTURER_API';
  /** Empty means every GTIN. */
  readonly gtinPrefixes: readonly string[];
  getProduct(gtin: string): Promise<SourceResult<ProductIdentity>>;
  getBatch(gtin: string, batchNumber: string): Promise<SourceResult<BatchIdentity>>;
  getPack(gtin: string, serial: string): Promise<SourceResult<PackIdentity>>;
  getSourceStatus(): Promise<SourceStatus>;
}

export const notAttempted = (sourceName: string): Provenance => ({
  sourceType: 'NONE', sourceName, retrievalStatus: 'NOT_ATTEMPTED', retrievedAt: null,
  dataAsOf: null, isDemo: false, unavailableFields: [],
});

export function connectorFor(connectors: readonly ErpConnector[], gtin: string): ErpConnector | null {
  return connectors.find(({ gtinPrefixes }) =>
    gtinPrefixes.length === 0 || gtinPrefixes.some((prefix) => gtin.startsWith(prefix))) ?? null;
}
