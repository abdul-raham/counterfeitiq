# Shared API Contract — Agree and Commit First

The canonical, frozen TypeScript contract is `packages/shared/schemas.ts`. The excerpt below is historical context; contributors must import the canonical types rather than duplicating them. Keep backend Worker runtime compatibility.

## Contract review corrections

- Every `ReferenceLookupResult` carries provenance. `NOT_FOUND` is structurally restricted to an executed, authoritative `NAFDAC_GREENBOOK` lookup. Demo fixture misses return `SOURCE_UNAVAILABLE` with non-authoritative fixture provenance.
- Requests that should not run (including a missing NAFDAC number or a non-medicine category) are not represented as official lookup misses; analysis keeps `reference: null` and reports insufficient evidence or unsupported category.
- `ApiError` always contains a machine-readable `code`, human-readable `message`, and `retryable` flag. Codes cover invalid type, excessive size, unreadable images, model timeout, rate limiting, service unavailability and internal failure.
- `MAX_IMAGE_BYTES` is 4 MiB and is imported by both frontend and Worker validation. This conservative ceiling leaves headroom below Cloudflare Worker request and memory limits. The selected hosted Gemma provider must be verified to accept at least this ceiling before its adapter is merged.

```ts
export type VerificationStatus =
  | 'REGISTRATION_DETAILS_MATCH'
  | 'DETAILS_MISMATCH'
  | 'RECORD_NOT_FOUND'
  | 'INSUFFICIENT_EVIDENCE'
  | 'REFERENCE_UNAVAILABLE';

export type ReferenceSource = 'NAFDAC_GREENBOOK' | 'DEMO_FIXTURE';
export type LookupStatus = 'FOUND' | 'NOT_FOUND' | 'SOURCE_UNAVAILABLE';
export type FieldMatch = 'MATCH' | 'MISMATCH' | 'UNKNOWN';

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
  source: ReferenceSource;
  retrievedAt: string;
  sourceUrl?: string;
}

export type ReferenceLookupResult =
  | { status: 'FOUND'; record: MedicineReference }
  | { status: 'NOT_FOUND' | 'SOURCE_UNAVAILABLE'; record: null };

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
```

## Routes
- `GET /api/health`: Worker health.
- `POST /api/analyze`: `multipart/form-data`, field `image` (JPEG/PNG/WebP); returns `AnalysisResponse`.
- `GET /api/reference/:number`: medicine registration lookup, returns `ReferenceLookupResult`. Confirm URL encoding and rate limits.

## Behavior
- Missing number: `INSUFFICIENT_EVIDENCE`, not `RECORD_NOT_FOUND`.
- Only completed, authoritative lookup with no exact match may return `NOT_FOUND`.
- Network/permission/source failure: `SOURCE_UNAVAILABLE`.
- Non-medicine: extraction may succeed; `categoryVerificationSupported=false`, no Greenbook lookup, `INSUFFICIENT_EVIDENCE` with explanation of unsupported source.
- Fixture `FOUND` is for demonstration only; UI must show `DEMO_FIXTURE` prominently.
- `physicalAuthenticityConfirmed` always false.
- Do not treat null field as mismatch.
- Manual lookup does not require image; displays reference, not physical authentication.

## Mock example (fictional)
```json
{
  "extracted": {"category":"medicine","productName":"Example Medicine","brand":null,"nafdacNumber":"A1-123456","manufacturer":"Example Pharma","strength":"500 mg","ingredients":[],"batchNumber":null,"manufacturingDate":null,"expiryDate":"2027-06"},
  "reference": {"status":"SOURCE_UNAVAILABLE","record":null},
  "verification": {"status":"REFERENCE_UNAVAILABLE","categoryVerificationSupported":true,"findings":[],"summary":"Registration source is currently unavailable.","recommendedActions":["Check the official NAFDAC source directly."],"physicalAuthenticityConfirmed":false,"packageExpiryStatus":"NOT_EXPIRED","registrationExpiryStatus":"UNKNOWN"}
}
```
