import type {
  ActivateCodeAllocationRequest,
  AuditLogEntry,
  AuthenticatePackRequest,
  AuthenticatePackResponse,
  AuthenticationCodeRecord,
  Batch,
  CodeAllocation,
  CreateBatchRequest,
  CreateCodeAllocationRequest,
  CreateInvestigationRequest,
  CreateManufacturerApplicationRequest,
  CreateProductRequest,
  Investigation,
  Manufacturer,
  ManufacturerApplication,
  ManufacturerDecisionRequest,
  ManufacturerMember,
  Pack,
  Product,
  PublicProductSummary,
  RevokeCodeRequest,
  UserProfile,
  UserRole,
  VerificationEvent,
} from '@counterfeitiq/shared/v2';

export interface HarnessSession {
  userId: string;
  email: string;
  role: UserRole;
  manufacturerId?: string;
}

function randomHex(bytesCount: number): string {
  const buffer = new Uint8Array(bytesCount);
  crypto.getRandomValues(buffer);
  return Array.from(buffer, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function hashSecretCode(secret: string, salt = 'counterfeitiq-v2-salt'): string {
  const input = `${salt}:${secret.trim().toUpperCase()}`;
  let h1 = 0xdeadbeef;
  let h2 = 0x41c64e6d;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const part1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const part2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return `digest-${part1}${part2}${part1}${part2}`;
}

export function hashPii(value: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < value.length; i++) {
    const ch = value.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= ch;
    h2 = Math.imul(h2, 0x5bd1e995);
  }
  const p1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const p2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return `${p1}${p2}`;
}

export class V2TestHarness {
  // In-memory relational tables
  users = new Map<string, UserProfile>();
  manufacturers = new Map<string, Manufacturer>();
  applications = new Map<string, ManufacturerApplication>();
  members = new Map<string, ManufacturerMember>();
  products = new Map<string, Product>();
  batches = new Map<string, Batch>();
  allocations = new Map<string, CodeAllocation>();
  packs = new Map<string, Pack>();
  packByPublicId = new Map<string, Pack>();
  codeRecords = new Map<string, AuthenticationCodeRecord>(); // keyed by packId
  codeRecordByDigest = new Map<string, AuthenticationCodeRecord>();
  verificationEvents: VerificationEvent[] = [];
  auditLogs: AuditLogEntry[] = [];
  investigations = new Map<string, Investigation>();

  // In-memory rate limiting map: ip -> timestamps
  private requestAttempts = new Map<string, number[]>();

  // Helper for generating IDs
  generateId(prefix: string): string {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  // 1. User management
  createUser(email: string, displayName: string, platformRole: 'USER' | 'PLATFORM_ADMIN'): UserProfile {
    const id = this.generateId('usr');
    const now = new Date().toISOString();
    const user: UserProfile = {
      id,
      email,
      displayName,
      platformRole,
      createdAt: now,
      updatedAt: now,
    };
    this.users.set(id, user);
    return user;
  }

  // 2. Manufacturer Onboarding
  submitApplication(applicantUserId: string, req: CreateManufacturerApplicationRequest): ManufacturerApplication {
    // Check for duplicate legal name among active manufacturers
    for (const m of this.manufacturers.values()) {
      if (m.legalName.toLowerCase() === req.legalName.toLowerCase()) {
        throw new Error('DUPLICATE_ORGANIZATION: Legal name already registered');
      }
    }
    const id = this.generateId('app');
    const now = new Date().toISOString();
    const application: ManufacturerApplication = {
      id,
      applicantUserId,
      ...req,
      status: 'SUBMITTED',
      decisionReason: null,
      submittedAt: now,
      decidedAt: null,
    };
    this.applications.set(id, application);
    return application;
  }

  decideApplication(
    adminSession: HarnessSession,
    applicationId: string,
    req: ManufacturerDecisionRequest,
  ): ManufacturerApplication {
    if (adminSession.role !== 'PLATFORM_ADMIN') {
      throw new Error('FORBIDDEN: Platform admin role required');
    }
    const app = this.applications.get(applicationId);
    if (!app) throw new Error('NOT_FOUND: Application not found');
    if (app.status !== 'SUBMITTED' && app.status !== 'UNDER_REVIEW') {
      throw new Error('CONFLICT: Application already decided');
    }

    const now = new Date().toISOString();
    app.status = req.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    app.decisionReason = req.reason;
    app.decidedAt = now;

    if (req.decision === 'APPROVE') {
      const manufacturerId = this.generateId('mfr');
      const manufacturer: Manufacturer = {
        id: manufacturerId,
        legalName: app.legalName,
        displayName: app.displayName,
        registrationNumber: app.registrationNumber,
        nafdacManufacturerNumber: app.nafdacManufacturerNumber,
        status: 'ACTIVE',
        approvedAt: now,
        createdAt: now,
        updatedAt: now,
      };
      this.manufacturers.set(manufacturerId, manufacturer);

      // Create admin member
      const memberId = this.generateId('mbr');
      const member: ManufacturerMember = {
        id: memberId,
        manufacturerId,
        userId: app.applicantUserId,
        role: 'MANUFACTURER_ADMIN',
        permissions: [
          'manufacturer:read',
          'manufacturer:manage_members',
          'product:read',
          'product:write',
          'batch:read',
          'batch:write',
          'batch:block',
          'code:allocate',
          'code:activate',
          'verification_event:read',
        ],
        createdAt: now,
      };
      this.members.set(memberId, member);
    }

    return app;
  }

  // 3. Product Management (Tenant Scoped)
  createProduct(session: HarnessSession, req: CreateProductRequest): Product {
    if (!session.manufacturerId) throw new Error('UNAUTHENTICATED: Manufacturer context required');
    if (session.role !== 'MANUFACTURER_ADMIN' && session.role !== 'MANUFACTURER_OPERATOR') {
      throw new Error('FORBIDDEN: Insufficient permissions to create product');
    }

    const id = this.generateId('prd');
    const now = new Date().toISOString();
    const product: Product = {
      id,
      manufacturerId: session.manufacturerId,
      ...req,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    };
    this.products.set(id, product);
    return product;
  }

  listProducts(session: HarnessSession): Product[] {
    if (!session.manufacturerId) throw new Error('UNAUTHENTICATED: Manufacturer context required');
    // Tenant isolation: only return products belonging to session.manufacturerId
    return Array.from(this.products.values()).filter(
      (p) => p.manufacturerId === session.manufacturerId,
    );
  }

  // 4. Batch Management
  createBatch(session: HarnessSession, req: CreateBatchRequest): Batch {
    if (!session.manufacturerId) throw new Error('UNAUTHENTICATED: Manufacturer context required');
    const product = this.products.get(req.productId);
    if (!product || product.manufacturerId !== session.manufacturerId) {
      throw new Error('FORBIDDEN: Product does not belong to this manufacturer');
    }

    const id = this.generateId('btc');
    const now = new Date().toISOString();
    const batch: Batch = {
      id,
      manufacturerId: session.manufacturerId,
      productId: req.productId,
      batchNumber: req.batchNumber,
      manufacturingDate: req.manufacturingDate,
      expiryDate: req.expiryDate,
      status: 'ACTIVE',
      createdAt: now,
      activatedAt: now,
    };
    this.batches.set(id, batch);
    return batch;
  }

  blockBatch(session: HarnessSession, batchId: string): Batch {
    if (!session.manufacturerId) throw new Error('UNAUTHENTICATED: Manufacturer context required');
    const batch = this.batches.get(batchId);
    if (!batch || batch.manufacturerId !== session.manufacturerId) {
      throw new Error('FORBIDDEN: Batch does not belong to this manufacturer');
    }
    batch.status = 'BLOCKED';
    return batch;
  }

  // 5. Code Allocation & Activation
  createCodeAllocation(
    session: HarnessSession,
    req: CreateCodeAllocationRequest,
  ): { allocation: CodeAllocation; secretExports: { publicIdentifier: string; secretCode: string }[] } {
    if (!session.manufacturerId) throw new Error('UNAUTHENTICATED: Manufacturer context required');
    const batch = this.batches.get(req.batchId);
    if (!batch || batch.manufacturerId !== session.manufacturerId) {
      throw new Error('FORBIDDEN: Batch does not belong to this manufacturer');
    }

    const allocationId = this.generateId('alc');
    const now = new Date().toISOString();
    const secretExports: { publicIdentifier: string; secretCode: string }[] = [];

    for (let i = 0; i < req.quantity; i++) {
      const packId = this.generateId('pck');
      const publicIdentifier = `PUB-${randomHex(12).toUpperCase()}`;
      const secretCode = `SEC-${randomHex(12).toUpperCase()}`;
      const lookupDigest = hashSecretCode(secretCode);

      const pack: Pack = {
        id: packId,
        manufacturerId: session.manufacturerId,
        productId: batch.productId,
        batchId: batch.id,
        allocationId,
        publicIdentifier,
        status: 'INACTIVE', // Inactive until allocation activation!
        createdAt: now,
      };
      this.packs.set(packId, pack);
      this.packByPublicId.set(publicIdentifier, pack);

      const codeRecord: AuthenticationCodeRecord = {
        id: this.generateId('cod'),
        manufacturerId: session.manufacturerId,
        packId,
        lookupDigest, // Only digest stored, NEVER plaintext secret!
        lifecycleStatus: 'INACTIVE',
        firstVerifiedAt: null,
        revokedAt: null,
        createdAt: now,
      };
      this.codeRecords.set(packId, codeRecord);
      this.codeRecordByDigest.set(lookupDigest, codeRecord);

      secretExports.push({ publicIdentifier, secretCode });
    }

    const allocation: CodeAllocation = {
      id: allocationId,
      manufacturerId: session.manufacturerId,
      batchId: req.batchId,
      quantity: req.quantity,
      status: 'GENERATED',
      generatedCount: req.quantity,
      activatedCount: 0,
      createdAt: now,
      activatedAt: null,
    };
    this.allocations.set(allocationId, allocation);

    return { allocation, secretExports };
  }

  activateCodeAllocation(
    session: HarnessSession,
    allocationId: string,
    req: ActivateCodeAllocationRequest,
  ): CodeAllocation {
    if (!session.manufacturerId) throw new Error('UNAUTHENTICATED: Manufacturer context required');
    const allocation = this.allocations.get(allocationId);
    if (!allocation || allocation.manufacturerId !== session.manufacturerId) {
      throw new Error('FORBIDDEN: Allocation does not belong to this manufacturer');
    }
    if (req.confirmation !== 'LABELS_RECONCILED' || req.reconciliationCount !== allocation.quantity) {
      throw new Error('CONFLICT: Reconciliation count does not match generated quantity');
    }

    const now = new Date().toISOString();
    allocation.status = 'ACTIVE';
    allocation.activatedCount = allocation.quantity;
    allocation.activatedAt = now;

    // Transition all packs and codes to ACTIVE
    for (const pack of this.packs.values()) {
      if (pack.allocationId === allocationId) {
        pack.status = 'ACTIVE';
        const code = this.codeRecords.get(pack.id);
        if (code) {
          code.lifecycleStatus = 'ACTIVE';
        }
      }
    }

    return allocation;
  }

  revokeCode(adminSession: HarnessSession, codeId: string, req: RevokeCodeRequest): void {
    if (adminSession.role !== 'PLATFORM_ADMIN') {
      throw new Error('FORBIDDEN: Platform admin required to revoke code');
    }
    let targetCode: AuthenticationCodeRecord | null = null;
    for (const code of this.codeRecords.values()) {
      if (code.id === codeId) {
        targetCode = code;
        break;
      }
    }
    if (!targetCode) throw new Error('NOT_FOUND: Code record not found');
    const now = new Date().toISOString();
    targetCode.lifecycleStatus = 'REVOKED';
    targetCode.revokedAt = now;

    const pack = this.packs.get(targetCode.packId);
    if (pack) {
      pack.status = 'REVOKED';
    }

    this.auditLogs.push({
      id: this.generateId('aud'),
      actorUserId: adminSession.userId,
      manufacturerId: targetCode.manufacturerId,
      action: 'code:revoke',
      entityType: 'AuthenticationCode',
      entityId: targetCode.id,
      before: { lifecycleStatus: 'ACTIVE' },
      after: { lifecycleStatus: 'REVOKED', reason: req.reason },
      occurredAt: now,
      requestId: crypto.randomUUID(),
    });
  }

  // 6. Public Scan (Read-Only, Does NOT Consume Code)
  scanPublicPack(publicIdentifier: string): PublicProductSummary {
    const pack = this.packByPublicId.get(publicIdentifier);
    if (!pack) throw new Error('NOT_FOUND: Pack not found');

    const product = this.products.get(pack.productId);
    const manufacturer = this.manufacturers.get(pack.manufacturerId);
    const batch = this.batches.get(pack.batchId);

    if (!product || !manufacturer || !batch) {
      throw new Error('INTERNAL_ERROR: Incomplete pack relationship');
    }

    // Notice: Pack status is NOT modified, secret code is NOT modified!
    return {
      product: {
        id: product.id,
        name: product.name,
        brand: product.brand,
        dosageForm: product.dosageForm,
        strength: product.strength,
        activeIngredients: product.activeIngredients,
      },
      manufacturer: {
        id: manufacturer.id,
        displayName: manufacturer.displayName,
      },
      batch: {
        batchNumber: batch.batchNumber,
        manufacturingDate: batch.manufacturingDate,
        expiryDate: batch.expiryDate,
        status: batch.status,
      },
      pack: {
        publicIdentifier: pack.publicIdentifier,
        status: pack.status,
      },
      secretCodeRequired: true,
      authenticityConfirmed: false,
    };
  }

  // 7. Public Authentication (Scratch Secret Code)
  authenticatePack(
    req: AuthenticatePackRequest,
    meta: { ip: string; userAgent: string; requestId?: string } = { ip: '127.0.0.1', userAgent: 'test-agent' },
  ): AuthenticatePackResponse {
    // Rate limiting check: max 10 requests per minute per IP
    const nowMs = Date.now();
    const attempts = this.requestAttempts.get(meta.ip) || [];
    const recentAttempts = attempts.filter((t) => nowMs - t < 60000);
    if (recentAttempts.length >= 10) {
      throw new Error('RATE_LIMITED: Too many authentication attempts');
    }
    recentAttempts.push(nowMs);
    this.requestAttempts.set(meta.ip, recentAttempts);

    const nowIso = new Date(nowMs).toISOString();
    const requestId = meta.requestId || crypto.randomUUID();
    const ipHash = hashPii(meta.ip);
    const userAgentHash = hashPii(meta.userAgent);

    const pack = this.packByPublicId.get(req.publicIdentifier);
    if (!pack) {
      this.logEvent({
        id: this.generateId('evt'),
        manufacturerId: null,
        productId: null,
        batchId: null,
        packId: null,
        authenticationCodeId: null,
        outcome: 'INVALID_CODE',
        publicIdentifier: req.publicIdentifier,
        occurredAt: nowIso,
        requestId,
        ipHash,
        userAgentHash,
        metadata: { reason: 'Unknown publicIdentifier' },
      });
      return {
        outcome: 'INVALID_CODE',
        product: null,
        checkedAt: nowIso,
        firstVerifiedAt: null,
        message: 'The submitted identifier does not match any registered product.',
        authenticityConfirmed: false,
      };
    }

    const digest = hashSecretCode(req.secretCode);
    const code = this.codeRecords.get(pack.id);

    // If code record does not exist or digest does not match
    if (!code || code.lookupDigest !== digest) {
      this.logEvent({
        id: this.generateId('evt'),
        manufacturerId: pack.manufacturerId,
        productId: pack.productId,
        batchId: pack.batchId,
        packId: pack.id,
        authenticationCodeId: null,
        outcome: 'INVALID_CODE',
        publicIdentifier: req.publicIdentifier,
        occurredAt: nowIso,
        requestId,
        ipHash,
        userAgentHash,
        metadata: { reason: 'Digest mismatch' },
      });
      return {
        outcome: 'INVALID_CODE',
        product: null,
        checkedAt: nowIso,
        firstVerifiedAt: null,
        message: 'The concealed code entered is not valid for this pack.',
        authenticityConfirmed: false,
      };
    }

    const summary = this.scanPublicPack(pack.publicIdentifier);
    const batch = this.batches.get(pack.batchId);

    // 1. Check Batch Status
    if (batch?.status === 'BLOCKED' || batch?.status === 'RECALLED') {
      this.logEvent({
        id: this.generateId('evt'),
        manufacturerId: pack.manufacturerId,
        productId: pack.productId,
        batchId: pack.batchId,
        packId: pack.id,
        authenticationCodeId: code.id,
        outcome: 'BATCH_BLOCKED',
        publicIdentifier: req.publicIdentifier,
        occurredAt: nowIso,
        requestId,
        ipHash,
        userAgentHash,
        metadata: { batchStatus: batch.status },
      });
      return {
        outcome: 'BATCH_BLOCKED',
        product: summary,
        checkedAt: nowIso,
        firstVerifiedAt: code.firstVerifiedAt,
        message: 'This product batch has been blocked or recalled by the manufacturer.',
        authenticityConfirmed: false,
      };
    }

    // 2. Check Code / Pack Status: Revoked
    if (code.lifecycleStatus === 'REVOKED' || pack.status === 'REVOKED') {
      this.logEvent({
        id: this.generateId('evt'),
        manufacturerId: pack.manufacturerId,
        productId: pack.productId,
        batchId: pack.batchId,
        packId: pack.id,
        authenticationCodeId: code.id,
        outcome: 'CODE_REVOKED',
        publicIdentifier: req.publicIdentifier,
        occurredAt: nowIso,
        requestId,
        ipHash,
        userAgentHash,
        metadata: { codeStatus: code.lifecycleStatus },
      });
      return {
        outcome: 'CODE_REVOKED',
        product: summary,
        checkedAt: nowIso,
        firstVerifiedAt: code.firstVerifiedAt,
        message: 'This security code has been revoked and is no longer valid.',
        authenticityConfirmed: false,
      };
    }

    // 3. Check Code / Pack Status: Inactive
    if (code.lifecycleStatus === 'INACTIVE' || pack.status === 'INACTIVE') {
      this.logEvent({
        id: this.generateId('evt'),
        manufacturerId: pack.manufacturerId,
        productId: pack.productId,
        batchId: pack.batchId,
        packId: pack.id,
        authenticationCodeId: code.id,
        outcome: 'CODE_NOT_ACTIVE',
        publicIdentifier: req.publicIdentifier,
        occurredAt: nowIso,
        requestId,
        ipHash,
        userAgentHash,
        metadata: { codeStatus: code.lifecycleStatus },
      });
      return {
        outcome: 'CODE_NOT_ACTIVE',
        product: summary,
        checkedAt: nowIso,
        firstVerifiedAt: null,
        message: 'This pack has not yet been activated by the manufacturer.',
        authenticityConfirmed: false,
      };
    }

    // 4. Repeated Verification Check
    if (code.lifecycleStatus === 'FIRST_VERIFIED') {
      this.logEvent({
        id: this.generateId('evt'),
        manufacturerId: pack.manufacturerId,
        productId: pack.productId,
        batchId: pack.batchId,
        packId: pack.id,
        authenticationCodeId: code.id,
        outcome: 'PREVIOUSLY_VERIFIED',
        publicIdentifier: req.publicIdentifier,
        occurredAt: nowIso,
        requestId,
        ipHash,
        userAgentHash,
        metadata: { firstVerifiedAt: code.firstVerifiedAt },
      });
      return {
        outcome: 'PREVIOUSLY_VERIFIED',
        product: summary,
        checkedAt: nowIso,
        firstVerifiedAt: code.firstVerifiedAt,
        message: `Warning: This code was already verified on ${code.firstVerifiedAt}. Repeated verifications indicate possible code duplication or reuse.`,
        authenticityConfirmed: false,
      };
    }

    // 5. First Verification (Atomic State Transition)
    // In SQL this is: UPDATE codes SET lifecycle_status = 'FIRST_VERIFIED', first_verified_at = :now WHERE id = :id AND lifecycle_status = 'ACTIVE' RETURNING *;
    code.lifecycleStatus = 'FIRST_VERIFIED';
    code.firstVerifiedAt = nowIso;

    this.logEvent({
      id: this.generateId('evt'),
      manufacturerId: pack.manufacturerId,
      productId: pack.productId,
      batchId: pack.batchId,
      packId: pack.id,
      authenticationCodeId: code.id,
      outcome: 'FIRST_VERIFICATION',
      publicIdentifier: req.publicIdentifier,
      occurredAt: nowIso,
      requestId,
      ipHash,
      userAgentHash,
      metadata: { transition: 'ACTIVE -> FIRST_VERIFIED' },
    });

    return {
      outcome: 'FIRST_VERIFICATION',
      product: summary,
      checkedAt: nowIso,
      firstVerifiedAt: nowIso,
      message: 'Code successfully verified for the first time. Inspect packaging integrity.',
      authenticityConfirmed: false,
    };
  }

  // 8. Event logging helper
  private logEvent(event: VerificationEvent): void {
    this.verificationEvents.push(event);
  }

  // 9. Tenant-isolated event reading
  listVerificationEvents(session: HarnessSession): VerificationEvent[] {
    if (!session.manufacturerId) throw new Error('UNAUTHENTICATED: Manufacturer context required');
    return this.verificationEvents.filter((e) => e.manufacturerId === session.manufacturerId);
  }

  // 10. Suspicious Product Report & Investigation
  createInvestigation(req: CreateInvestigationRequest): Investigation {
    const id = this.generateId('inv');
    const now = new Date().toISOString();
    const investigation: Investigation = {
      id,
      publicIdentifier: req.publicIdentifier,
      authenticationOutcome: req.authenticationOutcome,
      aiAnalysis: req.aiAnalysis,
      report: req.aiAnalysis?.verification || null,
      createdAt: now,
    };
    this.investigations.set(id, investigation);
    return investigation;
  }
}
