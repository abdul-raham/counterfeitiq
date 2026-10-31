import type { ReferenceLookupResult } from './schemas';

export type IdentifierType = 'GTIN' | 'GS1_DATAMATRIX' | 'SERIALIZED' | 'UNKNOWN';
export type IdentityLevel = 'PRODUCT' | 'BATCH' | 'PACK';
export type SourceType = 'DEMO_ERP' | 'AUTHORIZED_ERP' | 'REGULATORY_REFERENCE';
export type SourceStatus = 'FOUND' | 'NOT_FOUND' | 'UNAVAILABLE';

export interface ProductInfo {
  name: string;
  brand: string | null;
  strength: string | null;
  dosageForm: string | null;
  activeIngredients: string[];
  packSize: string | null;
  nafdacNumber: string | null;
  description: string | null;
}

export interface ManufacturerInfo {
  name: string;
  country: string | null;
  website: string | null;
}

export interface BatchInfo {
  batchNumber: string;
  manufacturingDate: string | null;
  expiryDate: string | null;
  status: string | null;
}

export interface PackInfo {
  serialNumber: string;
  status: string | null;
}

export interface SourceInfo {
  type: SourceType;
  name: string;
  status: SourceStatus;
  retrievedAt: string;
}

export interface ResultWarning {
  code: string;
  severity: 'INFO' | 'WARNING' | 'HIGH';
  message: string;
}

/** Only for a fresh scan of a serialized pack. Every pack of a product shares its plain barcode. */
export interface ScanSummary {
  previousScans: number;
  firstScannedAt: string | null;
  /** How long these counts last. */
  persistenceNote: string;
}

export interface ResolveResponse {
  /** The identifier in its normalized, readable form. */
  identifier: string;
  identifierType: IdentifierType;
  /** Null when no record was found. */
  identityLevel: IdentityLevel | null;
  product: ProductInfo | null;
  manufacturer: ManufacturerInfo | null;
  batch: BatchInfo | null;
  pack: PackInfo | null;
  source: SourceInfo;
  reference: ReferenceLookupResult | null;
  scanSummary: ScanSummary | null;
  warnings: ResultWarning[];
  limitations: string[];
}

export interface ResolveRequest {
  identifier: string;
  /** True only for a fresh scan, so reloading a page never counts as a repeat scan. */
  recordScan: boolean;
  /** A random per-tab ID holding no personal information. */
  anonymousSessionId: string | null;
}
