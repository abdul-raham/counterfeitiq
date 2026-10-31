import type { AnalysisResponse } from '@counterfeitiq/shared';
import { RequestError } from '../../lib/errors';
import { PackNotFoundError } from '../../lib/v2/client';
import type {
  ActivateCodeAllocationRequest,
  AuditLogEntry,
  AuthenticatePackResponse,
  AuthenticationOutcome,
  Batch,
  CodeAllocation,
  CreateBatchRequest,
  CreateCodeAllocationRequest,
  CreateManufacturerApplicationRequest,
  CreateProductRequest,
  Investigation,
  Manufacturer,
  ManufacturerApplication,
  PaginatedResponse,
  Product,
  PublicProductSummary,
  VerificationEvent,
} from '../../lib/v2/contract';

// Development fixtures only. Everything here is fictional, is held in memory, and is loaded
// only when VITE_USE_SAMPLE_DATA is 'true', when the interface shows a permanent banner.

const NOW = '2026-10-31T09:00:00.000Z';
const page = <T,>(items: T[]): PaginatedResponse<T> => ({ items, nextCursor: null });
let nextId = 100;
const id = (prefix: string) => `${prefix}-${++nextId}`;

const profile: Manufacturer = {
  id: 'mfr-1', legalName: 'Example Pharma Ltd', displayName: 'Example Pharma', registrationNumber: 'RC-000000',
  nafdacManufacturerNumber: null, status: 'ACTIVE', approvedAt: NOW, createdAt: NOW, updatedAt: NOW,
};

const products: Product[] = [{
  id: 'prd-1', manufacturerId: 'mfr-1', name: 'Example Medicine', brand: 'Examplex', description: 'Fictional sample product.',
  dosageForm: 'Tablet', strength: '500 mg', activeIngredients: ['Exampleol'], nafdacNumber: 'A1-123456',
  status: 'ACTIVE', createdAt: NOW, updatedAt: NOW,
}];

const batches: Batch[] = [
  { id: 'bat-1', manufacturerId: 'mfr-1', productId: 'prd-1', batchNumber: 'EX2041', manufacturingDate: '2025-06-01', expiryDate: '2027-06-30', status: 'ACTIVE', createdAt: NOW, activatedAt: NOW },
  { id: 'bat-2', manufacturerId: 'mfr-1', productId: 'prd-1', batchNumber: 'EX2042', manufacturingDate: '2025-07-01', expiryDate: '2027-07-31', status: 'BLOCKED', createdAt: NOW, activatedAt: NOW },
];

const allocations: CodeAllocation[] = [
  { id: 'alc-1', manufacturerId: 'mfr-1', batchId: 'bat-1', quantity: 500, status: 'ACTIVE', generatedCount: 500, activatedCount: 500, createdAt: NOW, activatedAt: NOW },
  { id: 'alc-2', manufacturerId: 'mfr-1', batchId: 'bat-1', quantity: 200, status: 'GENERATED', generatedCount: 200, activatedCount: 0, createdAt: NOW, activatedAt: null },
];

const applications: ManufacturerApplication[] = [{
  id: 'app-1', applicantUserId: 'usr-9', legalName: 'Sample Labs Nigeria Ltd', displayName: 'Sample Labs', registrationNumber: 'RC-111111',
  nafdacManufacturerNumber: null, contactEmail: 'contact@sample-labs.example', contactPhone: null, evidenceUrls: [],
  status: 'SUBMITTED', decisionReason: null, submittedAt: NOW, decidedAt: null,
}];

const investigations: Investigation[] = [];
const audit: AuditLogEntry[] = [];
const events: VerificationEvent[] = [];

function summary(publicIdentifier: string, batchStatus: Batch['status'] = 'ACTIVE', packStatus: PublicProductSummary['pack']['status'] = 'ACTIVE'): PublicProductSummary {
  return {
    product: { id: 'prd-1', name: 'Example Medicine', brand: 'Examplex', dosageForm: 'Tablet', strength: '500 mg', activeIngredients: ['Exampleol'] },
    manufacturer: { id: 'mfr-1', displayName: 'Example Pharma' },
    batch: { batchNumber: batchStatus === 'BLOCKED' ? 'EX2042' : 'EX2041', manufacturingDate: '2025-06-01', expiryDate: '2027-06-30', status: batchStatus },
    pack: { publicIdentifier, status: packStatus },
    secretCodeRequired: true,
    authenticityConfirmed: false,
  };
}

export const SAMPLE_PACKS = [
  { id: 'CIQ-DEMO-0001', note: 'first check, then repeat', code: 'DEMO-1111' },
  { id: 'CIQ-DEMO-0002', note: 'code already checked', code: 'DEMO-2222' },
  { id: 'CIQ-DEMO-0003', note: 'code revoked', code: 'DEMO-3333' },
  { id: 'CIQ-DEMO-0004', note: 'batch blocked', code: 'DEMO-4444' },
  { id: 'CIQ-DEMO-0005', note: 'not yet active', code: 'DEMO-5555' },
  { id: 'CIQ-DEMO-0006', note: 'verification unavailable', code: 'DEMO-6666' },
];

const firstChecked = new Map<string, string>([['CIQ-DEMO-0002', '2026-09-14T15:20:00.000Z']]);

export function sampleScan(identifier: string): PublicProductSummary {
  if (!SAMPLE_PACKS.some((pack) => pack.id === identifier)) throw new PackNotFoundError();
  if (identifier === 'CIQ-DEMO-0004') return summary(identifier, 'BLOCKED', 'BLOCKED');
  if (identifier === 'CIQ-DEMO-0003') return summary(identifier, 'ACTIVE', 'REVOKED');
  if (identifier === 'CIQ-DEMO-0005') return summary(identifier, 'ACTIVE', 'INACTIVE');
  return summary(identifier);
}

export function sampleAuthenticate(publicIdentifier: string, secretCode: string): AuthenticatePackResponse {
  const pack = SAMPLE_PACKS.find((item) => item.id === publicIdentifier);
  const reply = (outcome: AuthenticationOutcome, firstVerifiedAt: string | null, message: string): AuthenticatePackResponse => {
    events.unshift({
      id: id('evt'), manufacturerId: 'mfr-1', productId: 'prd-1', batchId: 'bat-1', packId: null, authenticationCodeId: null,
      outcome, publicIdentifier, occurredAt: new Date().toISOString(), requestId: id('req'), ipHash: null, userAgentHash: null, metadata: {},
    });
    return { outcome, product: outcome === 'INVALID_CODE' ? null : sampleScan(publicIdentifier), checkedAt: new Date().toISOString(), firstVerifiedAt, message, authenticityConfirmed: false };
  };

  if (!pack) return reply('INVALID_CODE', null, 'This code was not recognized.');
  if (publicIdentifier === 'CIQ-DEMO-0006') return reply('VERIFICATION_UNAVAILABLE', null, 'Verification is unavailable.');
  if (pack.code !== secretCode.toUpperCase()) return reply('INVALID_CODE', null, 'This code was not recognized for this pack.');
  if (publicIdentifier === 'CIQ-DEMO-0003') return reply('CODE_REVOKED', null, 'This code has been revoked.');
  if (publicIdentifier === 'CIQ-DEMO-0004') return reply('BATCH_BLOCKED', null, 'This batch has been blocked.');
  if (publicIdentifier === 'CIQ-DEMO-0005') return reply('CODE_NOT_ACTIVE', null, 'This code is not active.');
  const earlier = firstChecked.get(publicIdentifier);
  if (earlier) return reply('PREVIOUSLY_VERIFIED', earlier, 'This code has been checked before.');
  const checkedAt = new Date().toISOString();
  firstChecked.set(publicIdentifier, checkedAt);
  return reply('FIRST_VERIFICATION', checkedAt, 'This code was recognized.');
}

export function sampleInvestigation(input: { publicIdentifier: string | null; authenticationOutcome: AuthenticationOutcome | null; aiAnalysis: AnalysisResponse | null; notes: string | null }): Investigation {
  const created: Investigation = { id: id('inv'), ...input, report: null, createdAt: new Date().toISOString() };
  investigations.unshift(created);
  return created;
}

export function sampleApply(input: CreateManufacturerApplicationRequest): ManufacturerApplication {
  const created: ManufacturerApplication = { ...input, id: id('app'), applicantUserId: 'usr-sample', status: 'SUBMITTED', decisionReason: null, submittedAt: new Date().toISOString(), decidedAt: null };
  applications.unshift(created);
  return created;
}

export const sampleProducts = () => page([...products]);
export const sampleBatches = () => page([...batches]);
export const sampleAllocations = () => page([...allocations]);
export const sampleEvents = () => page([...events]);
export const sampleApplications = () => page([...applications]);
export const sampleManufacturers = () => page([profile]);
export const sampleInvestigations = () => page([...investigations]);
export const sampleAudit = () => page([...audit]);
export const sampleProfile = () => profile;

export function sampleCreateProduct(input: CreateProductRequest): Product {
  const created: Product = { ...input, id: id('prd'), manufacturerId: 'mfr-1', status: 'DRAFT', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  products.unshift(created);
  return created;
}

export function sampleCreateBatch(input: CreateBatchRequest): Batch {
  const created: Batch = { ...input, id: id('bat'), manufacturerId: 'mfr-1', status: 'DRAFT', createdAt: new Date().toISOString(), activatedAt: null };
  batches.unshift(created);
  return created;
}

export function sampleCreateAllocation(input: CreateCodeAllocationRequest): CodeAllocation {
  const created: CodeAllocation = { id: id('alc'), manufacturerId: 'mfr-1', batchId: input.batchId, quantity: input.quantity, status: 'GENERATED', generatedCount: input.quantity, activatedCount: 0, createdAt: new Date().toISOString(), activatedAt: null };
  allocations.unshift(created);
  return created;
}

export function sampleActivateAllocation(allocationId: string, input: ActivateCodeAllocationRequest): CodeAllocation {
  const allocation = allocations.find((item) => item.id === allocationId);
  if (!allocation || input.reconciliationCount !== allocation.generatedCount) throw new RequestError('INTERNAL_ERROR', false);
  allocation.status = 'ACTIVE';
  allocation.activatedCount = allocation.generatedCount;
  allocation.activatedAt = new Date().toISOString();
  return { ...allocation };
}

function record(action: string, entityType: string, entityId: string, after: Record<string, unknown>) {
  audit.unshift({ id: id('aud'), actorUserId: 'usr-admin', manufacturerId: null, action, entityType, entityId, before: null, after, occurredAt: new Date().toISOString(), requestId: id('req') });
}

export function sampleDecide(applicationId: string, decision: 'APPROVE' | 'REJECT', reason: string): ManufacturerApplication {
  const application = applications.find((item) => item.id === applicationId);
  if (!application) throw new RequestError('INTERNAL_ERROR', false);
  application.status = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
  application.decisionReason = reason;
  application.decidedAt = new Date().toISOString();
  record(`application.${decision.toLowerCase()}`, 'manufacturer_application', applicationId, { reason });
  return { ...application };
}

export function sampleRevoke(codeId: string, reason: string): void {
  record('code.revoke', 'authentication_code', codeId, { reason });
}
