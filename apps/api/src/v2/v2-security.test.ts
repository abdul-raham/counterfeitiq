import { beforeEach, describe, expect, it } from 'vitest';
import { V2TestHarness, type HarnessSession } from './test-harness';
import type { AuthenticatePackResponse, Product } from '@counterfeitiq/shared/v2';

describe('CounterfeitIQ V2 Security Test Suite (Phase 4)', () => {
  let harness: V2TestHarness;
  let adminSession: HarnessSession;
  let tenantASession: HarnessSession;
  let tenantBSession: HarnessSession;
  let tenantAProduct: Product;
  let tenantAPack: { publicIdentifier: string; secretCode: string };

  beforeEach(() => {
    harness = new V2TestHarness();
    const admin = harness.createUser('admin@platform.example', 'Admin', 'PLATFORM_ADMIN');
    adminSession = { userId: admin.id, email: admin.email, role: 'PLATFORM_ADMIN' };

    // Setup Tenant A
    const appA = harness.submitApplication('user-a', {
      legalName: 'Tenant A Pharma Ltd',
      displayName: 'Tenant A',
      registrationNumber: 'RC-111',
      nafdacManufacturerNumber: 'NAF-111',
      contactEmail: 'a@example.com',
      contactPhone: null,
      evidenceUrls: [],
    });
    harness.decideApplication(adminSession, appA.id, { decision: 'APPROVE', reason: 'Approved' });
    const mfrA = Array.from(harness.manufacturers.values()).find((m) => m.legalName === 'Tenant A Pharma Ltd')!;
    tenantASession = {
      userId: 'user-a',
      email: 'a@example.com',
      role: 'MANUFACTURER_ADMIN',
      manufacturerId: mfrA.id,
    };

    // Setup Tenant B
    const appB = harness.submitApplication('user-b', {
      legalName: 'Tenant B Diagnostics Ltd',
      displayName: 'Tenant B',
      registrationNumber: 'RC-222',
      nafdacManufacturerNumber: 'NAF-222',
      contactEmail: 'b@example.com',
      contactPhone: null,
      evidenceUrls: [],
    });
    harness.decideApplication(adminSession, appB.id, { decision: 'APPROVE', reason: 'Approved' });
    const mfrB = Array.from(harness.manufacturers.values()).find((m) => m.legalName === 'Tenant B Diagnostics Ltd')!;
    tenantBSession = {
      userId: 'user-b',
      email: 'b@example.com',
      role: 'MANUFACTURER_ADMIN',
      manufacturerId: mfrB.id,
    };

    // Tenant A creates product, batch, and allocation
    tenantAProduct = harness.createProduct(tenantASession, {
      name: 'Tenant A Amoxicillin 500mg',
      brand: 'Amox-A',
      description: 'Antibiotic',
      dosageForm: 'Capsule',
      strength: '500mg',
      activeIngredients: ['Amoxicillin'],
      nafdacNumber: '04-1111',
    });

    const batchA = harness.createBatch(tenantASession, {
      productId: tenantAProduct.id,
      batchNumber: 'BATCH-A-01',
      manufacturingDate: '2026-01-01',
      expiryDate: '2028-01-01',
    });

    const allocationData = harness.createCodeAllocation(tenantASession, {
      batchId: batchA.id,
      quantity: 5,
    });
    harness.activateCodeAllocation(tenantASession, allocationData.allocation.id, {
      reconciliationCount: 5,
      confirmation: 'LABELS_RECONCILED',
    });

    tenantAPack = allocationData.secretExports[0];
  });

  describe('SEC-01 & SEC-02: Secret Code Zero-Leakage & Public Scan Immutability', () => {
    it('never leaks secret plaintext in public scan responses', () => {
      const summary = harness.scanPublicPack(tenantAPack.publicIdentifier);
      const json = JSON.stringify(summary);

      expect(json).not.toContain(tenantAPack.secretCode);
      const summaryRecord = summary as unknown as Record<string, unknown>;
      expect(summaryRecord.secretCode).toBeUndefined();
      expect(summaryRecord.lookupDigest).toBeUndefined();
      expect(json).not.toContain('lookupDigest');
      expect(summary.secretCodeRequired).toBe(true);
      expect(summary.authenticityConfirmed).toBe(false);
    });

    it('proves public scan never consumes code or changes verification state', () => {
      const packRecord = harness.packByPublicId.get(tenantAPack.publicIdentifier)!;
      const codeRecord = harness.codeRecords.get(packRecord.id)!;

      expect(codeRecord.lifecycleStatus).toBe('ACTIVE');
      expect(codeRecord.firstVerifiedAt).toBeNull();

      // Scan 10 times consecutively
      for (let i = 0; i < 10; i++) {
        harness.scanPublicPack(tenantAPack.publicIdentifier);
      }

      // Code MUST still be unverified and unused
      expect(codeRecord.lifecycleStatus).toBe('ACTIVE');
      expect(codeRecord.firstVerifiedAt).toBeNull();
      expect(harness.verificationEvents).toHaveLength(0);
    });
  });

  describe('SEC-03: Race Conditions & Concurrency Control', () => {
    it('guarantees exactly one first-verification when concurrent requests fire simultaneously', async () => {
      // Simulate 20 simultaneous verification requests on the same pack
      const promises: Promise<AuthenticatePackResponse>[] = [];
      for (let i = 0; i < 20; i++) {
        promises.push(
          new Promise<AuthenticatePackResponse>((resolve) => {
            // Emulate atomic database transaction with microtask scheduling
            setTimeout(() => {
              const res = harness.authenticatePack(
                {
                  publicIdentifier: tenantAPack.publicIdentifier,
                  secretCode: tenantAPack.secretCode,
                },
                { ip: `10.0.0.${i + 1}`, userAgent: `Worker-${i}` },
              );
              resolve(res);
            }, Math.random() * 5); // Random slight network jitter
          }),
        );
      }

      const results = await Promise.all(promises);

      const firstVerifications = results.filter((r) => r.outcome === 'FIRST_VERIFICATION');
      const previouslyVerified = results.filter((r) => r.outcome === 'PREVIOUSLY_VERIFIED');

      expect(firstVerifications).toHaveLength(1);
      expect(previouslyVerified).toHaveLength(19);

      // Verify that all 19 repeat verifications reference the exact timestamp of the first verification
      const firstTimestamp = firstVerifications[0].firstVerifiedAt;
      expect(firstTimestamp).toBeDefined();
      for (const repeat of previouslyVerified) {
        expect(repeat.firstVerifiedAt).toBe(firstTimestamp);
      }
    });
  });

  describe('SEC-04: Cross-Tenant Data Isolation', () => {
    it('prevents Tenant B from viewing or listing Tenant A products', () => {
      const tenantBProducts = harness.listProducts(tenantBSession);
      expect(tenantBProducts).toHaveLength(0);

      const tenantAProducts = harness.listProducts(tenantASession);
      expect(tenantAProducts).toHaveLength(1);
      expect(tenantAProducts[0].name).toBe('Tenant A Amoxicillin 500mg');
    });

    it('prevents Tenant B from creating a batch or allocating codes under Tenant A product', () => {
      expect(() =>
        harness.createBatch(tenantBSession, {
          productId: tenantAProduct.id,
          batchNumber: 'TENANT-B-PIRATE',
          manufacturingDate: null,
          expiryDate: null,
        }),
      ).toThrowError(/FORBIDDEN/);
    });

    it('prevents Tenant B from reading Tenant A verification events', () => {
      // Perform verification on Tenant A pack
      harness.authenticatePack({
        publicIdentifier: tenantAPack.publicIdentifier,
        secretCode: tenantAPack.secretCode,
      });

      // Tenant A can see their event
      const eventsA = harness.listVerificationEvents(tenantASession);
      expect(eventsA).toHaveLength(1);
      expect(eventsA[0].manufacturerId).toBe(tenantASession.manufacturerId);

      // Tenant B sees zero events
      const eventsB = harness.listVerificationEvents(tenantBSession);
      expect(eventsB).toHaveLength(0);
    });
  });

  describe('SEC-05: Brute-Force & Rate Limiting Enforcement', () => {
    it('rate-limits rapid consecutive verification attempts from the same IP', () => {
      const attackerIp = '198.51.100.42';

      // 9 attempts should pass
      for (let i = 0; i < 9; i++) {
        harness.authenticatePack(
          { publicIdentifier: tenantAPack.publicIdentifier, secretCode: `GUESS-${i}` },
          { ip: attackerIp, userAgent: 'Bot/1.0' },
        );
      }

      // 10th attempt succeeds (limit ceiling)
      harness.authenticatePack(
        { publicIdentifier: tenantAPack.publicIdentifier, secretCode: 'GUESS-9' },
        { ip: attackerIp, userAgent: 'Bot/1.0' },
      );

      // 11th attempt must trigger RATE_LIMITED
      expect(() =>
        harness.authenticatePack(
          { publicIdentifier: tenantAPack.publicIdentifier, secretCode: 'GUESS-10' },
          { ip: attackerIp, userAgent: 'Bot/1.0' },
        ),
      ).toThrowError(/RATE_LIMITED/);
    });
  });

  describe('SEC-06 & SEC-08: Consumer Privacy & Honesty Invariants', () => {
    it('hashes IP addresses and User-Agents in verification events with zero PII leakage', () => {
      const rawIp = '192.168.1.100';
      const rawUa = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)';

      harness.authenticatePack(
        {
          publicIdentifier: tenantAPack.publicIdentifier,
          secretCode: tenantAPack.secretCode,
        },
        { ip: rawIp, userAgent: rawUa },
      );

      const event = harness.verificationEvents[0];
      expect(event).toBeDefined();

      // IP and UserAgent must be hashed, never plaintext
      expect(event.ipHash).not.toBe(rawIp);
      expect(event.ipHash).toHaveLength(16);
      expect(event.userAgentHash).not.toBe(rawUa);
      expect(event.userAgentHash).toHaveLength(16);

      // Event payload must not contain secretCode
      const eventJson = JSON.stringify(event);
      expect(eventJson).not.toContain(tenantAPack.secretCode);
    });

    it('guarantees authenticityConfirmed is strictly false on all outcomes', () => {
      // 1. First verification
      const res1 = harness.authenticatePack({
        publicIdentifier: tenantAPack.publicIdentifier,
        secretCode: tenantAPack.secretCode,
      });
      expect(res1.authenticityConfirmed).toBe(false);

      // 2. Repeat verification
      const res2 = harness.authenticatePack({
        publicIdentifier: tenantAPack.publicIdentifier,
        secretCode: tenantAPack.secretCode,
      });
      expect(res2.authenticityConfirmed).toBe(false);

      // 3. Invalid code
      const res3 = harness.authenticatePack({
        publicIdentifier: tenantAPack.publicIdentifier,
        secretCode: 'INVALID-SECRET',
      });
      expect(res3.authenticityConfirmed).toBe(false);
    });
  });
});
