import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AnalysisResponse } from '@counterfeitiq/shared';
import { analyzeImage } from '../../lib/api';
import { isAbort, toRequestError, type RequestError } from '../../lib/errors';
import { prepareImage } from './prepareImage';

type Phase = 'idle' | 'preparing' | 'analyzing';

interface ScanContextValue {
  file: File | null;
  previewUrl: string | null;
  phase: Phase;
  error: RequestError | null;
  result: AnalysisResponse | null;
  selectFile: (file: File) => Promise<void>;
  analyze: () => Promise<boolean>;
  cancel: () => void;
  reset: () => void;
}

const ScanContext = createContext<ScanContextValue | null>(null);

export function ScanProvider({ children }: { children: ReactNode }) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<RequestError | null>(null);
  const [result, setResult] = useState<AnalysisResponse | null>(null);

  const urlRef = useRef<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const selectionRef = useRef(0);

  const replacePreview = useCallback((next: File | null) => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = next ? URL.createObjectURL(next) : null;
    setFile(next);
    setPreviewUrl(urlRef.current);
  }, []);

  const cancel = useCallback(() => {
    requestRef.current?.abort();
    requestRef.current = null;
  }, []);

  const selectFile = useCallback(async (candidate: File) => {
    const selection = ++selectionRef.current;
    cancel();
    setError(null);
    setResult(null);
    setPhase('preparing');
    try {
      const prepared = await prepareImage(candidate);
      if (selection !== selectionRef.current) return;
      replacePreview(prepared);
    } catch (caught) {
      if (selection !== selectionRef.current) return;
      setError(toRequestError(caught));
    }
    setPhase('idle');
  }, [cancel, replacePreview]);

  const analyze = useCallback(async () => {
    if (!file) return false;
    cancel();
    const controller = new AbortController();
    requestRef.current = controller;
    setError(null);
    setPhase('analyzing');
    try {
      const response = await analyzeImage(file, controller.signal);
      if (requestRef.current !== controller) return false;
      setResult(response);
      setPhase('idle');
      return true;
    } catch (caught) {
      if (requestRef.current && requestRef.current !== controller) return false;
      if (!isAbort(caught)) setError(toRequestError(caught));
      setPhase('idle');
      return false;
    }
  }, [cancel, file]);

  const reset = useCallback(() => {
    selectionRef.current += 1;
    cancel();
    replacePreview(null);
    setError(null);
    setResult(null);
    setPhase('idle');
  }, [cancel, replacePreview]);

  useEffect(() => () => {
    requestRef.current?.abort();
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  }, []);

  const value = useMemo(
    () => ({ file, previewUrl, phase, error, result, selectFile, analyze, cancel, reset }),
    [file, previewUrl, phase, error, result, selectFile, analyze, cancel, reset],
  );

  return <ScanContext.Provider value={value}>{children}</ScanContext.Provider>;
}

export function useScan() {
  const value = useContext(ScanContext);
  if (!value) throw new Error('useScan must be used inside ScanProvider');
  return value;
}
