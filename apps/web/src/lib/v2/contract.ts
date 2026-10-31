// TEMPORARY copy of the uncommitted packages/shared/v2.ts from feat/v2-core-backend.
// Types only, unchanged. When that contract merges, delete this file and import
// from @counterfeitiq/shared/v2 instead. Do not edit it here: Codex owns the contract.

import type { AnalysisResponse, ExtractedProduct, InvestigationReport } from '@counterfeitiq/shared';

export type ISODateTime = string;
export type EntityId = string;

export type UserRole = 'PLATFORM_ADMIN' | 'MANUFACTURER_ADMIN' | 'MANUFACTURER_OPERATOR' | 'MANUFACTURER_VIEWER';
export type Permission =
  | 'manufacturer:read' | 'manufacturer:manage_members'
  | 'product:read' | 'product:write'
  | 'batch:read' | 'batch:write' | 'batch:block'
  | 'code:allocate' | 'code:activate' | 'code:revoke'
  | 'verification_event:read'
  | 'application:review' | 'audit_log:read' | 'suspicious_report:read';

export type ManufacturerStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'REJECTED';
export type ManufacturerApplicationStatus = 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED';
export type ProductStatus = 'DRAFT' | 'ACTIVE' | 'SUSPENDED' | 'RETIRED';
export type BatchStatus = 'DRAFT' | 'ACTIVE' | 'BLOCKED' | 'RECALLED' | 'EXPIRED';
export type AllocationStatus = 'DRAFT' | 'GENERATED' | 'ACTIVE' | 'CANCELLED';
export type PackStatus = 'INACTIVE' | 'ACTIVE' | 'REVOKED' | 'BLOCKED';
export type CodeLifecycleStatus = 'INACTIVE' | 'ACTIVE' | 'FIRST_VERIFIED' | 'REVOKED';

export interface UserProfile {
  id: EntityId;
  email: string;
  displayName: string;
  platformRole: 'USER' | 'PLATFORM_ADMIN';
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface Manufacturer {
  id: EntityId;
  legalName: string;
  displayName: string;
  registrationNumber: string | null;
  nafdacManufacturerNumber: string | null;
  status: ManufacturerStatus;
  approvedAt: ISODateTime | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface ManufacturerApplication {
  id: EntityId;
  applicantUserId: EntityId;
  legalName: string;
  displayName: string;
  registrationNumber: string | null;
  nafdacManufacturerNumber: string | null;
  contactEmail: string;
  contactPhone: string | null;
  evidenceUrls: string[];
  status: ManufacturerApplicationStatus;
  decisionReason: string | null;
  submittedAt: ISODateTime;
  decidedAt: ISODateTime | null;
}

export interface ManufacturerMember {
  id: EntityId;
  manufacturerId: EntityId;
  userId: EntityId;
  role: Exclude<UserRole, 'PLATFORM_ADMIN'>;
  permissions: Permission[];
  createdAt: ISODateTime;
}

export interface Product {
  id: EntityId;
  manufacturerId: EntityId;
  name: string;
  brand: string | null;
  description: string | null;
  dosageForm: string | null;
  strength: string | null;
  activeIngredients: string[];
  nafdacNumber: string | null;
  status: ProductStatus;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface ProductReferenceRecord {
  id: EntityId;
  productId: EntityId;
  source: 'MANUFACTURER_CLAIM' | 'NAFDAC_GREENBOOK' | 'OTHER_REGULATOR';
  externalIdentifier: string | null;
  sourceUrl: string | null;
  snapshot: Record<string, unknown>;
  retrievedAt: ISODateTime;
  authoritativeForAuthentication: false;
}

export interface Batch {
  id: EntityId;
  manufacturerId: EntityId;
  productId: EntityId;
  batchNumber: string;
  manufacturingDate: string | null;
  expiryDate: string | null;
  status: BatchStatus;
  createdAt: ISODateTime;
  activatedAt: ISODateTime | null;
}

export interface CodeAllocation {
  id: EntityId;
  manufacturerId: EntityId;
  batchId: EntityId;
  quantity: number;
  status: AllocationStatus;
  generatedCount: number;
  activatedCount: number;
  createdAt: ISODateTime;
  activatedAt: ISODateTime | null;
}

export interface Pack {
  id: EntityId;
  manufacturerId: EntityId;
  productId: EntityId;
  batchId: EntityId;
  allocationId: EntityId;
  publicIdentifier: string;
  status: PackStatus;
  createdAt: ISODateTime;
}

/** Server-side record. Secret plaintext must never be stored here. */
export interface AuthenticationCodeRecord {
  id: EntityId;
  manufacturerId: EntityId;
  packId: EntityId;
  lookupDigest: string;
  lifecycleStatus: CodeLifecycleStatus;
  firstVerifiedAt: ISODateTime | null;
  revokedAt: ISODateTime | null;
  createdAt: ISODateTime;
}

export type AuthenticationOutcome =
  | 'FIRST_VERIFICATION' | 'PREVIOUSLY_VERIFIED' | 'INVALID_CODE'
  | 'PRODUCT_MISMATCH' | 'CODE_REVOKED' | 'BATCH_BLOCKED'
  | 'CODE_NOT_ACTIVE' | 'VERIFICATION_UNAVAILABLE';

export interface VerificationEvent {
  id: EntityId;
  manufacturerId: EntityId | null;
  productId: EntityId | null;
  batchId: EntityId | null;
  packId: EntityId | null;
  authenticationCodeId: EntityId | null;
  outcome: AuthenticationOutcome;
  publicIdentifier: string | null;
  occurredAt: ISODateTime;
  requestId: string;
  ipHash: string | null;
  userAgentHash: string | null;
  metadata: Record<string, unknown>;
}

export interface AuditLogEntry {
  id: EntityId;
  actorUserId: EntityId | null;
  manufacturerId: EntityId | null;
  action: string;
  entityType: string;
  entityId: EntityId | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  occurredAt: ISODateTime;
  requestId: string;
}

export interface SuspiciousProductReport {
  id: EntityId;
  productId: EntityId | null;
  packId: EntityId | null;
  reason: string;
  details: string | null;
  status: 'OPEN' | 'REVIEWING' | 'CLOSED';
  createdAt: ISODateTime;
}

export interface PublicProductSummary {
  product: Pick<Product, 'id' | 'name' | 'brand' | 'dosageForm' | 'strength' | 'activeIngredients'>;
  manufacturer: Pick<Manufacturer, 'id' | 'displayName'>;
  batch: Pick<Batch, 'batchNumber' | 'manufacturingDate' | 'expiryDate' | 'status'>;
  pack: Pick<Pack, 'publicIdentifier' | 'status'>;
  secretCodeRequired: true;
  authenticityConfirmed: false;
}

export interface AuthenticatePackRequest {
  publicIdentifier: string;
  secretCode: string;
}

export interface AuthenticatePackResponse {
  outcome: AuthenticationOutcome;
  product: PublicProductSummary | null;
  checkedAt: ISODateTime;
  firstVerifiedAt: ISODateTime | null;
  message: string;
  authenticityConfirmed: false;
}

export interface CreateManufacturerApplicationRequest {
  legalName: string;
  displayName: string;
  registrationNumber: string | null;
  nafdacManufacturerNumber: string | null;
  contactEmail: string;
  contactPhone: string | null;
  evidenceUrls: string[];
}

export interface ManufacturerDecisionRequest {
  decision: 'APPROVE' | 'REJECT';
  reason: string;
}

export type CreateProductRequest = Omit<Product, 'id' | 'manufacturerId' | 'status' | 'createdAt' | 'updatedAt'>;
export type CreateBatchRequest = Omit<Batch, 'id' | 'manufacturerId' | 'status' | 'createdAt' | 'activatedAt'>;

export interface CreateCodeAllocationRequest {
  batchId: EntityId;
  quantity: number;
}

export interface ActivateCodeAllocationRequest {
  reconciliationCount: number;
  confirmation: 'LABELS_RECONCILED';
}

export interface RevokeCodeRequest {
  reason: string;
}

export interface CreateInvestigationRequest {
  publicIdentifier: string | null;
  authenticationOutcome: AuthenticationOutcome | null;
  aiAnalysis: AnalysisResponse | null;
  notes: string | null;
}

export interface Investigation {
  id: EntityId;
  publicIdentifier: string | null;
  authenticationOutcome: AuthenticationOutcome | null;
  aiAnalysis: AnalysisResponse | null;
  report: InvestigationReport | null;
  createdAt: ISODateTime;
}

export interface AiExtractionRequest {
  imageUrl: string;
  requestId: string;
}

export interface AiExtractionResult {
  extracted: ExtractedProduct;
  provider: string;
  model: string;
  completedAt: ISODateTime;
  authoritative: false;
}

export interface AiServiceError {
  code: 'AI_TIMEOUT' | 'AI_RATE_LIMITED' | 'AI_UNAVAILABLE' | 'AI_INVALID_RESPONSE';
  message: string;
  retryable: boolean;
}

export interface PaginatedResponse<T> {
  items: T[];
  nextCursor: string | null;
}

export type V2ApiErrorCode =
  | 'VALIDATION_ERROR' | 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND'
  | 'CONFLICT' | 'RATE_LIMITED' | 'SERVICE_UNAVAILABLE' | 'INTERNAL_ERROR';

export interface V2ErrorResponse {
  error: {
    code: V2ApiErrorCode;
    message: string;
    retryable: boolean;
    requestId: string;
  };
}
