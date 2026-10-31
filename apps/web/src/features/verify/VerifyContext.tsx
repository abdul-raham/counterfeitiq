import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { AuthenticatePackResponse } from '../../lib/v2/contract';

export interface VerificationResult {
  publicIdentifier: string;
  response: AuthenticatePackResponse;
  /** An earlier attempt may have reached the server, so a repeat result could be their own. */
  afterFailedAttempt: boolean;
}

interface VerifyContextValue {
  result: VerificationResult | null;
  setResult: (result: VerificationResult | null) => void;
}

const VerifyContext = createContext<VerifyContextValue | null>(null);

// The result stays in memory, and the secret code is never kept: not in the URL, not in storage.
export function VerifyProvider({ children }: { children: ReactNode }) {
  const [result, setResult] = useState<VerificationResult | null>(null);
  const value = useMemo(() => ({ result, setResult }), [result]);
  return <VerifyContext.Provider value={value}>{children}</VerifyContext.Provider>;
}

export function useVerify() {
  const value = useContext(VerifyContext);
  if (!value) throw new Error('useVerify must be used inside VerifyProvider');
  return value;
}
