import { useCallback, useEffect, useState } from 'react';

interface Settled<T> {
  version: number;
  load: () => Promise<T>;
  data?: T;
  error?: unknown;
}

/** Loads data for a screen. Pass a stable function: a module function or a useCallback. */
export function useResource<T>(load: () => Promise<T>) {
  const [version, setVersion] = useState(0);
  const [settled, setSettled] = useState<Settled<T> | null>(null);

  useEffect(() => {
    let active = true;
    load().then(
      (data) => { if (active) setSettled({ version, load, data }); },
      (error: unknown) => { if (active) setSettled({ version, load, error }); },
    );
    return () => {
      active = false;
    };
  }, [load, version]);

  const reload = useCallback(() => setVersion((value) => value + 1), []);
  const current = settled?.version === version && settled.load === load ? settled : null;
  return { data: current?.data, error: current?.error, loading: current === null, reload };
}
