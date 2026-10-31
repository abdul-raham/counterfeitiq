import type { MedicineReference } from '@counterfeitiq/shared';

// Mirrors the response of GET /api/scan, defined in apps/ai-service/src/erp. Those types live
// inside the Worker, so they are repeated here until they move to packages/shared.

export type ScanOutcome = 'RESOLVED' | 'NOT_FOUND' | 'SOURCE_UNAVAILABLE' | 'INVALID_IDENTIFIER';
export type IdentityLevel = 'PRODUCT' | 'BATCH' | 'PACK' | 'UNRESOLVED';

export interface Provenance {
  sourceType: 'SIMULATED_ERP' | 'MANUFACTURER_API' | 'NAFDAC_PUBLIC_REFERENCE' | 'DEMO_REFERENCE_FIXTURE' | 'NONE';
  sourceName: string;
  retrievalStatus: 'RETRIEVED' | 'NOT_FOUND' | 'UNAVAILABLE' | 'UNSUPPORTED' | 'NOT_ATTEMPTED';
  retrievedAt: string | null;
  dataAsOf: string | null;
  isDemo: boolean;
  unavailableFields: string[];
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
}

export interface BatchIdentity {
  gtin: string;
  batchNumber: string;
  manufacturingDate: string | null;
  expiryDate: string | null;
  status: 'ACTIVE' | 'BLOCKED' | 'RECALLED' | 'UNKNOWN';
}

export interface PackIdentity {
  gtin: string;
  serial: string;
  batchNumber: string | null;
  status: 'ACTIVE' | 'BLOCKED' | 'UNKNOWN';
}

export interface ScanSignal {
  /** Includes this scan. */
  totalScans: number;
  /** A lower bound, because a person can clear the browser's random value. */
  distinctDevices: number;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface ScanWarning {
  code: string;
  explanation: string;
}

export interface ProductReport {
  outcome: ScanOutcome;
  identityLevel: IdentityLevel;
  identifier: { gtin: string | null; batchNumber: string | null; serial: string | null; printedExpiryDate: string | null };
  product: ProductIdentity | null;
  batch: BatchIdentity | null;
  pack: PackIdentity | null;
  registrationReference: MedicineReference | null;
  scanSignal: ScanSignal | null;
  warnings: ScanWarning[];
  explanation: string;
  sources: Provenance[];
  physicalAuthenticityConfirmed: false;
  notice: string;
}
