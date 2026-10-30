/**
 * Maximum raw image size accepted by both browser and Worker.
 * 4 MiB leaves headroom for multipart/base64 encoding and Worker buffering.
 */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type AcceptedImageType = (typeof ACCEPTED_IMAGE_TYPES)[number];

export type VerificationStatus =
  | 'REGISTRATION_DETAILS_MATCH'
  | 'DETAILS_MISMATCH'
  | 'RECORD_NOT_FOUND'
  | 'INSUFFICIENT_EVIDENCE'
  | 'REFERENCE_UNAVAILABLE';

export type ReferenceSource = 'NAFDAC_GREENBOOK' | 'DEMO_FIXTURE' | 'NONE';
export type LookupMode = 'LIVE_OFFICIAL' | 'DEMO_FIXTURE' | 'NOT_EXECUTED';
export type LookupStatus = 'FOUND' | 'NOT_FOUND' | 'SOURCE_UNAVAILABLE';
export type FieldMatch = 'MATCH' | 'MISMATCH' | 'UNKNOWN';

export interface ReferenceProvenance {
  source: ReferenceSource;
  mode: LookupMode;
  authoritative: boolean;
  requestedAt: string | null;
  sourceUrl?: string;
  note?: string;
}

export interface ExtractedProduct {
  category: string | null;
  productName: string | null;
  brand: string | null;
  nafdacNumber: string | null;
  manufacturer: string | null;
  strength: string | null;
  ingredients: string[];
  batchNumber: string | null;
  manufacturingDate: string | null;
  expiryDate: string | null;
}

export interface MedicineReference {
  productName: string;
  nafdacNumber: string;
  manufacturer: string | null;
  strength: string | null;
  ingredients: string[];
  registrationExpiry: string | null;
  retrievedAt: string;
}

type LiveProvenance = ReferenceProvenance & {
  source: 'NAFDAC_GREENBOOK';
  mode: 'LIVE_OFFICIAL';
  authoritative: true;
  requestedAt: string;
};

type FixtureProvenance = ReferenceProvenance & {
  source: 'DEMO_FIXTURE';
  mode: 'DEMO_FIXTURE';
  authoritative: false;
  requestedAt: string;
};

type UnavailableProvenance = ReferenceProvenance & {
  authoritative: false;
};

export type ReferenceLookupResult =
  | { status: 'FOUND'; record: MedicineReference; provenance: LiveProvenance | FixtureProvenance }
  | { status: 'NOT_FOUND'; record: null; provenance: LiveProvenance }
  | { status: 'SOURCE_UNAVAILABLE'; record: null; provenance: UnavailableProvenance };

export type ApiErrorCode =
  | 'INVALID_FILE_TYPE'
  | 'FILE_TOO_LARGE'
  | 'UNREADABLE_IMAGE'
  | 'MODEL_TIMEOUT'
  | 'RATE_LIMITED'
  | 'SERVICE_UNAVAILABLE'
  | 'INTERNAL_ERROR';

export interface ApiError {
  code: ApiErrorCode;
  message: string;
  retryable: boolean;
}

export interface ApiErrorResponse {
  error: ApiError;
}

export interface VerificationFinding {
  code: string;
  field: string;
  status: FieldMatch;
  severity: 'INFO' | 'WARNING' | 'HIGH';
  packagingValue: string | null;
  referenceValue: string | null;
  explanation: string;
}

export interface InvestigationReport {
  status: VerificationStatus;
  categoryVerificationSupported: boolean;
  findings: VerificationFinding[];
  summary: string;
  recommendedActions: string[];
  physicalAuthenticityConfirmed: false;
  packageExpiryStatus: 'EXPIRED' | 'NOT_EXPIRED' | 'UNKNOWN';
  registrationExpiryStatus: 'EXPIRED' | 'NOT_EXPIRED' | 'UNKNOWN';
}

export interface AnalysisResponse {
  extracted: ExtractedProduct;
  reference: ReferenceLookupResult | null;
  verification: InvestigationReport;
}

export function validateImageFile(file: Pick<File, 'size' | 'type'>): ApiError | null {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type as AcceptedImageType)) {
    return { code: 'INVALID_FILE_TYPE', message: 'Choose a JPEG, PNG or WebP image.', retryable: false };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { code: 'FILE_TOO_LARGE', message: 'Choose an image no larger than 4 MiB.', retryable: false };
  }
  return null;
}

export function isMedicineCategory(category: string | null): boolean {
  return category?.trim().toLowerCase() === 'medicine';
}

export function shouldLookupMedicine(product: Pick<ExtractedProduct, 'category' | 'nafdacNumber'>): boolean {
  return isMedicineCategory(product.category) && Boolean(product.nafdacNumber?.trim());
}
