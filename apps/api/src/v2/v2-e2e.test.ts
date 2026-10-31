import { beforeEach, describe, expect, it } from 'vitest';
import { V2TestHarness, type HarnessSession } from './test-harness';
import type { AnalysisResponse } from '@counterfeitiq/shared';
import type { Batch, CodeAllocation, Product } from '@counterfeitiq/shared/v2';

describe('CounterfeitIQ V2 End-to-End System Tests (Phase 3)', () => {
  let harness: V2TestHarness;
  let adminSession: HarnessSession;
  let applicantUserId: string;
  let manufacturerSession: HarnessSession;

  beforeEach(() => {
    harness = new V2TestHarness();
    const adminUser = harness.createUser('admin@platform.example', 'Platform Admin', 'PLATFORM_ADMIN');
    adminSession = {
      userId: adminUser.id,
      email: adminUser.email,
      role: 'PLATFORM_ADMIN',
    };

    const applicant = harness.createUser('lead@pharmaplus.example', 'PharmaPlus Rep', 'USER');
    applicantUserId = applicant.id;
  });

  describe('1. Manufacturer Onboarding & Admin Decisions', () => {
    it('handles complete application submission, approval, and rejected duplicate', () => {
      // 1. Submit application
      const app = harness.submitApplication(applicantUserId, {
        legalName: 'PharmaPlus Healthcare Ltd',
        displayName: 'PharmaPlus',
        registrationNumber: 'RC-123456',
        nafdacManufacturerNumber: 'NAF-MFR-789',
        contactEmail: 'contact@pharmaplus.example',
        contactPhone: '+2348000000000',
        evidenceUrls: ['https://example.com/cert.pdf'],
      });

      expect(app.status).toBe('SUBMITTED');
      expect(app.decisionReason).toBeNull();

      // 2. Non-admin cannot decide
      const unauthorizedSession: HarnessSession = {
        userId: applicantUserId,
        email: 'lead@pharmaplus.example',
        role: 'MANUFACTURER_VIEWER',
      };
      expect(() =>
        harness.decideApplication(unauthorizedSession, app.id, {
          decision: 'APPROVE',
          reason: 'Legitimate pharmaceutical manufacturer',
        }),
      ).toThrowError(/FORBIDDEN/);

      // 3. Platform Admin approves
      const approvedApp = harness.decideApplication(adminSession, app.id, {
        decision: 'APPROVE',
        reason: 'Verified NAFDAC premises and CAC documentation',
      });
      expect(approvedApp.status).toBe('APPROVED');
      expect(approvedApp.decidedAt).not.toBeNull();

      // Find created manufacturer
      const mfr = Array.from(harness.manufacturers.values()).find(
        (m) => m.legalName === 'PharmaPlus Healthcare Ltd',
      );
      expect(mfr).toBeDefined();
      expect(mfr?.status).toBe('ACTIVE');

      // 4. Duplicate organization legalName rejection
      expect(() =>
        harness.submitApplication('another-user', {
          legalName: 'PharmaPlus Healthcare Ltd',
          displayName: 'PharmaPlus Copy',
          registrationNumber: 'RC-999999',
          nafdacManufacturerNumber: null,
          contactEmail: 'other@example.com',
          contactPhone: null,
          evidenceUrls: [],
        }),
      ).toThrowError(/DUPLICATE_ORGANIZATION/);
    });

    it('records explicit admin rejection with reason', () => {
      const app = harness.submitApplication(applicantUserId, {
        legalName: 'Suspicious Chem Co',
        displayName: 'Suspicious Chem',
        registrationNumber: null,
        nafdacManufacturerNumber: null,
        contactEmail: 'chem@example.com',
        contactPhone: null,
        evidenceUrls: [],
      });

      const rejectedApp = harness.decideApplication(adminSession, app.id, {
        decision: 'REJECT',
        reason: 'Unverifiable manufacturing premises',
      });

      expect(rejectedApp.status).toBe('REJECTED');
      expect(rejectedApp.decisionReason).toBe('Unverifiable manufacturing premises');
      expect(harness.manufacturers.size).toBe(0);
    });
  });

  describe('2. Product Management, Batches & Tenant Isolation', () => {
    beforeEach(() => {
      const app = harness.submitApplication(applicantUserId, {
        legalName: 'Apex Pharmaceuticals Ltd',
        displayName: 'Apex Pharma',
        registrationNumber: 'RC-55555',
        nafdacManufacturerNumber: 'NAF-MFR-555',
        contactEmail: 'apex@example.com',
        contactPhone: null,
        evidenceUrls: [],
      });
      harness.decideApplication(adminSession, app.id, {
        decision: 'APPROVE',
        reason: 'Verified',
      });
      const mfr = Array.from(harness.manufacturers.values())[0];
      manufacturerSession = {
        userId: applicantUserId,
        email: 'apex@example.com',
        role: 'MANUFACTURER_ADMIN',
        manufacturerId: mfr.id,
      };
    });

    it('creates product and batch within manufacturer boundary', () => {
      // 1. Create product
      const product = harness.createProduct(manufacturerSession, {
        name: 'Apex Artemether-Lumefantrine 20/120mg',
        brand: 'Apex Co-Artem',
        description: 'Antimalarial tablet formulation',
        dosageForm: 'Tablet',
        strength: '20mg/120mg',
        activeIngredients: ['Artemether', 'Lumefantrine'],
        nafdacNumber: 'A4-1234',
      });

      expect(product.id).toBeDefined();
      expect(product.manufacturerId).toBe(manufacturerSession.manufacturerId);

      // 2. Create batch
      const batch = harness.createBatch(manufacturerSession, {
        productId: product.id,
        batchNumber: 'APX-2026-B01',
        manufacturingDate: '2026-01-15',
        expiryDate: '2028-01-14',
      });

      expect(batch.productId).toBe(product.id);
      expect(batch.batchNumber).toBe('APX-2026-B01');
      expect(batch.status).toBe('ACTIVE');

      // 3. Prohibit creating batch under foreign product
      const foreignSession: HarnessSession = {
        userId: 'intruder',
        email: 'intruder@other.example',
        role: 'MANUFACTURER_ADMIN',
        manufacturerId: 'foreign-mfr-id',
      };
      expect(() =>
        harness.createBatch(foreignSession, {
          productId: product.id,
          batchNumber: 'HACK-999',
          manufacturingDate: null,
          expiryDate: null,
        }),
      ).toThrowError(/FORBIDDEN/);
    });
  });

  describe('3. Code Allocation, Lifecycle, and Public Consumer Scan Journey', () => {
    let product: Product;
    let batch: Batch;
    let allocationData: { allocation: CodeAllocation; secretExports: { publicIdentifier: string; secretCode: string }[] };

    beforeEach(() => {
      const app = harness.submitApplication(applicantUserId, {
        legalName: 'BioHealth Labs Ltd',
        displayName: 'BioHealth',
        registrationNumber: 'RC-777',
        nafdacManufacturerNumber: 'NAF-777',
        contactEmail: 'bio@example.com',
        contactPhone: null,
        evidenceUrls: [],
      });
      harness.decideApplication(adminSession, app.id, { decision: 'APPROVE', reason: 'Approved' });
      const mfr = Array.from(harness.manufacturers.values())[0];
      manufacturerSession = {
        userId: applicantUserId,
        email: 'bio@example.com',
        role: 'MANUFACTURER_ADMIN',
        manufacturerId: mfr.id,
      };

      product = harness.createProduct(manufacturerSession, {
        name: 'BioHealth Paracetamol 500mg',
        brand: 'BioHealth',
        description: 'Pain relief',
        dosageForm: 'Tablet',
        strength: '500mg',
        activeIngredients: ['Paracetamol'],
        nafdacNumber: '04-0001',
      });

      batch = harness.createBatch(manufacturerSession, {
        productId: product.id,
        batchNumber: 'BH-B2026',
        manufacturingDate: '2026-06-01',
        expiryDate: '2029-05-31',
      });

      // Allocate 5 packs
      allocationData = harness.createCodeAllocation(manufacturerSession, {
        batchId: batch.id,
        quantity: 5,
      });
    });

    it('maintains inactive state until label reconciliation, then verifies first and repeat use', () => {
      const { allocation, secretExports } = allocationData;
      expect(allocation.status).toBe('GENERATED');
      expect(secretExports).toHaveLength(5);

      const targetPack = secretExports[0];

      // 1. Prior to activation, code must be CODE_NOT_ACTIVE
      const preActivationResult = harness.authenticatePack({
        publicIdentifier: targetPack.publicIdentifier,
        secretCode: targetPack.secretCode,
      });
      expect(preActivationResult.outcome).toBe('CODE_NOT_ACTIVE');
      expect(preActivationResult.authenticityConfirmed).toBe(false);

      // 2. Reconcile and activate allocation
      const activatedAlloc = harness.activateCodeAllocation(manufacturerSession, allocation.id, {
        reconciliationCount: 5,
        confirmation: 'LABELS_RECONCILED',
      });
      expect(activatedAlloc.status).toBe('ACTIVE');

      // 3. Public Scan: Scan QR before scratching
      const publicScan = harness.scanPublicPack(targetPack.publicIdentifier);
      expect(publicScan.product.name).toBe('BioHealth Paracetamol 500mg');
      expect(publicScan.secretCodeRequired).toBe(true);
      expect(publicScan.authenticityConfirmed).toBe(false);
      // Verify public scan DID NOT consume code
      const codeRecord = harness.codeRecords.get(harness.packByPublicId.get(targetPack.publicIdentifier)!.id);
      expect(codeRecord?.lifecycleStatus).toBe('ACTIVE');
      expect(codeRecord?.firstVerifiedAt).toBeNull();

      // 4. Consumer scratches concealed code and submits authentication (FIRST_VERIFICATION)
      const firstResult = harness.authenticatePack({
        publicIdentifier: targetPack.publicIdentifier,
        secretCode: targetPack.secretCode,
      });
      expect(firstResult.outcome).toBe('FIRST_VERIFICATION');
      expect(firstResult.firstVerifiedAt).not.toBeNull();
      expect(firstResult.authenticityConfirmed).toBe(false);
      expect(firstResult.message).toContain('first time');

      // 5. Subsequent authentication attempt (PREVIOUSLY_VERIFIED)
      const repeatResult = harness.authenticatePack({
        publicIdentifier: targetPack.publicIdentifier,
        secretCode: targetPack.secretCode,
      });
      expect(repeatResult.outcome).toBe('PREVIOUSLY_VERIFIED');
      expect(repeatResult.firstVerifiedAt).toBe(firstResult.firstVerifiedAt);
      expect(repeatResult.message).toContain('Warning: This code was already verified');
      expect(repeatResult.authenticityConfirmed).toBe(false);

      // 6. Unknown Secret Code attempt
      const invalidResult = harness.authenticatePack({
        publicIdentifier: targetPack.publicIdentifier,
        secretCode: 'WRONG-SECRET-CODE-XYZ',
      });
      expect(invalidResult.outcome).toBe('INVALID_CODE');

      // 7. Unknown Public Identifier attempt
      const unknownResult = harness.authenticatePack({
        publicIdentifier: 'PUB-NONEXISTENT-999',
        secretCode: targetPack.secretCode,
      });
      expect(unknownResult.outcome).toBe('INVALID_CODE');
    });

    it('enforces revocation and blocked batch rules', () => {
      // Activate allocation
      harness.activateCodeAllocation(manufacturerSession, allocationData.allocation.id, {
        reconciliationCount: 5,
        confirmation: 'LABELS_RECONCILED',
      });

      const pack1 = allocationData.secretExports[1];
      const pack2 = allocationData.secretExports[2];

      // Admin revokes pack1
      const pack1Record = harness.packByPublicId.get(pack1.publicIdentifier)!;
      const code1 = harness.codeRecords.get(pack1Record.id)!;
      harness.revokeCode(adminSession, code1.id, { reason: 'Packaging reported stolen' });

      // Verifying revoked code returns CODE_REVOKED
      const revokedResult = harness.authenticatePack({
        publicIdentifier: pack1.publicIdentifier,
        secretCode: pack1.secretCode,
      });
      expect(revokedResult.outcome).toBe('CODE_REVOKED');
      expect(revokedResult.message).toContain('revoked');

      // Manufacturer blocks batch
      harness.blockBatch(manufacturerSession, batch.id);

      // Verifying any code in blocked batch returns BATCH_BLOCKED
      const blockedResult = harness.authenticatePack({
        publicIdentifier: pack2.publicIdentifier,
        secretCode: pack2.secretCode,
      });
      expect(blockedResult.outcome).toBe('BATCH_BLOCKED');
      expect(blockedResult.message).toContain('blocked or recalled');
    });
  });

  describe('4. Suspicious Product Report & Non-Authoritative AI Investigation', () => {
    it('creates investigation linking authentication outcome and advisory AI analysis', () => {
      const mockAiAnalysis: AnalysisResponse = {
        extracted: {
          category: 'medicine',
          productName: 'BioHealth Paracetamol',
          brand: 'BioHealth',
          nafdacNumber: '04-0001',
          manufacturer: 'BioHealth Labs Ltd',
          strength: '500mg',
          ingredients: ['Paracetamol'],
          batchNumber: 'BH-B2026',
          manufacturingDate: '2026-06-01',
          expiryDate: '2029-05-31',
        },
        reference: {
          status: 'FOUND',
          record: {
            productName: 'BioHealth Paracetamol',
            nafdacNumber: '04-0001',
            manufacturer: 'BioHealth Labs Ltd',
            strength: '500mg',
            ingredients: ['Paracetamol'],
            registrationExpiry: '2030-01-01',
            retrievedAt: new Date().toISOString(),
          },
          provenance: {
            source: 'NAFDAC_GREENBOOK',
            mode: 'LIVE_OFFICIAL',
            authoritative: true,
            requestedAt: new Date().toISOString(),
          },
        },
        verification: {
          categoryVerificationSupported: true,
          physicalAuthenticityConfirmed: false,
          packageExpiryStatus: 'NOT_EXPIRED',
          registrationExpiryStatus: 'NOT_EXPIRED',
          status: 'REGISTRATION_DETAILS_MATCH',
          findings: [],
          summary: 'Registration details match.',
          recommendedActions: ['Inspect pack integrity.'],
        },
      };

      const investigation = harness.createInvestigation({
        publicIdentifier: 'PUB-SAMPLE-1234',
        authenticationOutcome: 'PREVIOUSLY_VERIFIED',
        aiAnalysis: mockAiAnalysis,
        notes: 'Consumer reported scratch foil was already scratched before purchase.',
      });

      expect(investigation.id).toBeDefined();
      expect(investigation.authenticationOutcome).toBe('PREVIOUSLY_VERIFIED');
      expect(investigation.report?.physicalAuthenticityConfirmed).toBe(false);
      expect(investigation.report?.status).toBe('REGISTRATION_DETAILS_MATCH');
    });
  });
});
