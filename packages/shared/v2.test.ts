import { describe, expectTypeOf, it } from 'vitest';
import type {
  AuthenticatePackRequest,
  AuthenticatePackResponse,
  AuthenticationCodeRecord,
  AuthenticationOutcome,
  ProductReferenceRecord,
  UserRole,
  V2ApiErrorCode,
} from './v2';

describe('CounterfeitIQ V2 contracts', () => {
  it('keeps public and secret identifiers separate', () => {
    expectTypeOf<AuthenticatePackRequest>().toHaveProperty('publicIdentifier');
    expectTypeOf<AuthenticatePackRequest>().toHaveProperty('secretCode');
    expectTypeOf<AuthenticationCodeRecord>().toHaveProperty('lookupDigest');
    expectTypeOf<AuthenticationCodeRecord>().not.toHaveProperty('secretCode');
  });

  it('defines every authentication state without declaring a pack genuine', () => {
    expectTypeOf<AuthenticationOutcome>().toEqualTypeOf<
      'FIRST_VERIFICATION' | 'PREVIOUSLY_VERIFIED' | 'INVALID_CODE' |
      'PRODUCT_MISMATCH' | 'CODE_REVOKED' | 'BATCH_BLOCKED' |
      'CODE_NOT_ACTIVE' | 'VERIFICATION_UNAVAILABLE'
    >();
    expectTypeOf<AuthenticatePackResponse['authenticityConfirmed']>().toEqualTypeOf<false>();
  });

  it('separates platform administration from manufacturer roles', () => {
    expectTypeOf<UserRole>().toEqualTypeOf<
      'PLATFORM_ADMIN' | 'MANUFACTURER_ADMIN' | 'MANUFACTURER_OPERATOR' | 'MANUFACTURER_VIEWER'
    >();
  });

  it('prevents regulator records from becoming authentication proof', () => {
    expectTypeOf<ProductReferenceRecord['authoritativeForAuthentication']>().toEqualTypeOf<false>();
  });

  it('defines transport errors needed by authenticated V2 routes', () => {
    expectTypeOf<V2ApiErrorCode>().toEqualTypeOf<
      'VALIDATION_ERROR' | 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND' |
      'CONFLICT' | 'RATE_LIMITED' | 'SERVICE_UNAVAILABLE' | 'INTERNAL_ERROR'
    >();
  });
});
