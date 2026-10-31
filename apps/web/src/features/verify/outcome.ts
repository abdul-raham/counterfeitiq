import type { Tone } from '../../components/StatusMessage';
import type { AuthenticationOutcome } from '../../lib/v2/contract';

export interface OutcomeCopy {
  tone: Tone;
  title: string;
  body: string;
  nextSteps: string[];
  canRetry?: boolean;
}

const REPORT_STEP = 'Ask a pharmacist, or report this pack to us.';

// A recognised code shows that the code exists in the manufacturer's records. A label can be
// copied, so no outcome here may say or imply that the medicine itself is genuine.
export const OUTCOMES: Record<AuthenticationOutcome, OutcomeCopy> = {
  FIRST_VERIFICATION: {
    tone: 'accent',
    title: 'Code recognized, first check',
    body: "This code is in the manufacturer's records, and this is the first time it has been checked. A code can be copied, so this does not by itself prove the medicine inside is genuine.",
    nextSteps: ['Check that the seal is intact and the printing looks clean.', 'Buy medicines from a licensed pharmacy.'],
  },
  PREVIOUSLY_VERIFIED: {
    tone: 'warn',
    title: 'This code has been checked before',
    body: 'If you did not check it yourself, it may have been copied or the pack may have been opened or resold. This does not prove the product is fake.',
    nextSteps: ['If this was not you, do not rely on this pack until a pharmacist has checked it.', 'Report the pack so the manufacturer can investigate.'],
  },
  INVALID_CODE: {
    tone: 'warn',
    title: 'Code not recognized',
    body: 'This code does not match this pack. It may have been mistyped, so check it against the panel and try again.',
    nextSteps: ['Re-enter the code carefully.', REPORT_STEP],
    canRetry: true,
  },
  PRODUCT_MISMATCH: {
    tone: 'risk',
    title: 'This code does not belong to this product',
    body: 'The code is linked to a different product from the one scanned. Do not rely on this pack until it has been checked.',
    nextSteps: [REPORT_STEP],
  },
  CODE_REVOKED: {
    tone: 'risk',
    title: 'This code has been revoked',
    body: 'The code has been withdrawn and should not be in use. Do not rely on this pack until it has been checked.',
    nextSteps: [REPORT_STEP],
  },
  BATCH_BLOCKED: {
    tone: 'risk',
    title: 'This batch has been blocked',
    body: 'This batch has been blocked or recalled. Do not use this product until a pharmacist has checked it.',
    nextSteps: [REPORT_STEP],
  },
  CODE_NOT_ACTIVE: {
    tone: 'warn',
    title: 'This code is not active yet',
    body: 'The manufacturer has not activated this code, so packs carrying it should not be on sale yet.',
    nextSteps: [REPORT_STEP],
  },
  VERIFICATION_UNAVAILABLE: {
    tone: 'neutral',
    title: 'Verification is unavailable',
    body: 'We could not check this code just now. This says nothing about the product. Please try again shortly.',
    nextSteps: ['Try again later.'],
    canRetry: true,
  },
};
