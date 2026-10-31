import { describe, expectTypeOf, it } from 'vitest';
import type {
  AiExtractionResult,
  AiServiceError,
  AuthenticatePackRequest,
  AuthenticatePackResponse,
  AuthenticationCodeRecord,
  AuthenticationOutcome,
  Batch,
  CodeAllocation,
  ManufacturerMember,
  Pack,
  Product,
  ProductReferenceRecord,
  PublicProductSummary,
  UserRole,
  V2ApiErrorCode,
  VerificationEvent,
} from './v2';

describe('V2 Contract Compliance & Security Invariants', () => {
  describe('Independent Operations: Public Scan vs Secret Authentication', () => {
    it('guarantees public pack summary does not reveal or consume secret codes', () => {
      // PublicProductSummary must never contain secret plaintext or digest
      expectTypeOf<PublicProductSummary>().not.toHaveProperty('secretCode');
      expectTypeOf<PublicProductSummary>().not.toHaveProperty('lookupDigest');
      expectTypeOf<PublicProductSummary>().not.toHaveProperty('firstVerifiedAt');

      // PublicProductSummary must assert that secret is required and authenticity is not confirmed
      expectTypeOf<PublicProductSummary['secretCodeRequired']>().toEqualTypeOf<true>();
      expectTypeOf<PublicProductSummary['authenticityConfirmed']>().toEqualTypeOf<false>();
    });

    it('enforces secret-code requirement on authentication requests', () => {
      expectTypeOf<AuthenticatePackRequest>().toHaveProperty('publicIdentifier');
      expectTypeOf<AuthenticatePackRequest>().toHaveProperty('secretCode');
    });

    it('enforces that authentication never claims physical authenticity is confirmed', () => {
      expectTypeOf<AuthenticatePackResponse['authenticityConfirmed']>().toEqualTypeOf<false>();
      expectTypeOf<AuthenticatePackResponse['outcome']>().toEqualTypeOf<AuthenticationOutcome>();
    });

    it('prohibits storing plaintext secrets in AuthenticationCodeRecord', () => {
      expectTypeOf<AuthenticationCodeRecord>().toHaveProperty('lookupDigest');
      expectTypeOf<AuthenticationCodeRecord>().not.toHaveProperty('secretCode');
      expectTypeOf<AuthenticationCodeRecord>().not.toHaveProperty('plaintextCode');
      expectTypeOf<AuthenticationCodeRecord>().not.toHaveProperty('rawCode');
    });
  });

  describe('Multi-Tenancy & Entity Ownership Invariants', () => {
    it('verifies all manufacturer-owned entities carry manufacturerId', () => {
      expectTypeOf<Product>().toHaveProperty('manufacturerId');
      expectTypeOf<Batch>().toHaveProperty('manufacturerId');
      expectTypeOf<CodeAllocation>().toHaveProperty('manufacturerId');
      expectTypeOf<Pack>().toHaveProperty('manufacturerId');
      expectTypeOf<AuthenticationCodeRecord>().toHaveProperty('manufacturerId');
      expectTypeOf<ManufacturerMember>().toHaveProperty('manufacturerId');
    });

    it('verifies batch and product hierarchy', () => {
      expectTypeOf<Batch['productId']>().toBeString();
      expectTypeOf<Batch['manufacturerId']>().toBeString();
      expectTypeOf<Pack['batchId']>().toBeString();
      expectTypeOf<Pack['productId']>().toBeString();
      expectTypeOf<Pack['allocationId']>().toBeString();
    });

    it('separates platform administration roles from tenant roles', () => {
      expectTypeOf<UserRole>().toEqualTypeOf<
        'PLATFORM_ADMIN' | 'MANUFACTURER_ADMIN' | 'MANUFACTURER_OPERATOR' | 'MANUFACTURER_VIEWER'
      >();

      // Manufacturer members cannot hold PLATFORM_ADMIN
      expectTypeOf<ManufacturerMember['role']>().toEqualTypeOf<
        'MANUFACTURER_ADMIN' | 'MANUFACTURER_OPERATOR' | 'MANUFACTURER_VIEWER'
      >();
    });
  });

  describe('Auditing, Privacy, and Non-Authoritative AI Boundaries', () => {
    it('ensures verification events protect consumer privacy by using hashes instead of raw PII', () => {
      expectTypeOf<VerificationEvent>().toHaveProperty('ipHash');
      expectTypeOf<VerificationEvent>().toHaveProperty('userAgentHash');
      expectTypeOf<VerificationEvent>().not.toHaveProperty('ipAddress');
      expectTypeOf<VerificationEvent>().not.toHaveProperty('userEmail');
      expectTypeOf<VerificationEvent>().not.toHaveProperty('consumerName');
      expectTypeOf<VerificationEvent>().not.toHaveProperty('secretCode');
    });

    it('enforces that AI extraction is explicitly non-authoritative', () => {
      expectTypeOf<AiExtractionResult['authoritative']>().toEqualTypeOf<false>();
      expectTypeOf<AiServiceError['code']>().toEqualTypeOf<
        'AI_TIMEOUT' | 'AI_RATE_LIMITED' | 'AI_UNAVAILABLE' | 'AI_INVALID_RESPONSE'
      >();
    });

    it('enforces that regulator reference records cannot act as authentication proof', () => {
      expectTypeOf<ProductReferenceRecord['authoritativeForAuthentication']>().toEqualTypeOf<false>();
    });
  });

  describe('Error Response Model & Transport Consistency', () => {
    it('enforces standardized error codes across V2 API', () => {
      expectTypeOf<V2ApiErrorCode>().toEqualTypeOf<
        | 'VALIDATION_ERROR'
        | 'UNAUTHENTICATED'
        | 'FORBIDDEN'
        | 'NOT_FOUND'
        | 'CONFLICT'
        | 'RATE_LIMITED'
        | 'SERVICE_UNAVAILABLE'
        | 'INTERNAL_ERROR'
      >();
    });
  });
});
