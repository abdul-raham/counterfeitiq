import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { ReferenceLookupResult } from '@counterfeitiq/shared';
import { Search } from 'lucide-react';
import { Button } from '../components/Button';
import { ErrorState } from '../components/ErrorState';
import { Input } from '../components/Input';
import { PageHeading } from '../components/PageHeading';
import { Skeleton } from '../components/Skeleton';
import { StatusMessage } from '../components/StatusMessage';
import { registrationWarning, unavailableReason } from '../features/report/outcome';
import { RecordDetails } from '../features/report/RecordDetails';
import { SourceNotice } from '../features/report/SourceNotice';
import { isSampleMode, lookupReference } from '../lib/api';
import { isAbort, toRequestError, type RequestError } from '../lib/errors';

const LOOKUP_CAVEAT = 'This confirms a record exists. It does not verify any physical product or pack.';

function LookupResult({ result, number }: { result: ReferenceLookupResult; number: string }) {
  if (result.status === 'FOUND') {
    const demo = result.provenance.mode === 'DEMO_FIXTURE';
    const warning = registrationWarning(result);
    return (
      <div className="space-y-4">
        <StatusMessage tone={demo || warning ? 'warn' : 'ok'} title={demo ? 'Demonstration record found' : 'Registration record found'}>
          {LOOKUP_CAVEAT}
        </StatusMessage>
        {warning && <StatusMessage tone="risk" title={warning}>Check the current registration status with NAFDAC before using this product.</StatusMessage>}
        <RecordDetails record={result.record} />
        <SourceNotice reference={result} />
      </div>
    );
  }

  if (result.status === 'NOT_FOUND') {
    return (
      <div className="space-y-4">
        <StatusMessage tone="warn" title="No registration record found">
          The lookup finished and found no exact match for {number}. This does not prove a product is fake. Check the
          number on the pack, or ask a pharmacist or NAFDAC.
        </StatusMessage>
        <SourceNotice reference={result} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <StatusMessage tone="warn" title="Registration records could not be checked">
        We don't know whether {number} is registered, because {unavailableReason[result.provenance.mode]}. Try again later, or check the
        official NAFDAC source directly.
      </StatusMessage>
      <SourceNotice reference={result} />
    </div>
  );
}

export function LookupPage() {
  const [number, setNumber] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<RequestError | null>(null);
  const [result, setResult] = useState<ReferenceLookupResult | null>(null);
  const request = useRef<AbortController | null>(null);

  useEffect(() => () => request.current?.abort(), []);

  async function runLookup(value: string) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setSubmitted(value);
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await lookupReference(value, controller.signal);
      if (request.current === controller) setResult(response);
    } catch (caught) {
      if (!isAbort(caught) && request.current === controller) setError(toRequestError(caught));
    } finally {
      if (request.current === controller) setLoading(false);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const value = number.trim();
    if (!value) {
      setInputError('Enter the NAFDAC number printed on the pack.');
      return;
    }
    setInputError(null);
    void runLookup(value);
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-8 sm:px-6 sm:py-12">
      <PageHeading title="Enter NAFDAC number">
        Check whether a medicine has a registration record. No photo needed.
      </PageHeading>

      <form onSubmit={handleSubmit} noValidate className="mt-6">
        <Input
          label="NAFDAC number"
          hint={isSampleMode()
            ? 'Sample numbers: A1-123456 (record found), A1-000000 (no record), A1-999999 (source unavailable).'
            : 'Usually printed near the product name, for example A1-1234.'}
          value={number}
          error={inputError}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={40}
          onChange={(event) => setNumber(event.target.value)}
        />
        <Button type="submit" disabled={loading} className="mt-4 w-full">
          <Search aria-hidden="true" className="size-5" />
          Look up record
        </Button>
      </form>

      <div className="mt-8" aria-live="polite">
        {loading && (
          <div role="status">
            <p className="text-sm text-muted">Checking available registration records</p>
            <div className="mt-3 space-y-2.5" aria-hidden="true">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-3.5 w-1/2" />
            </div>
          </div>
        )}
        {error && (
          <ErrorState error={error}>
            {error.retryable && <Button variant="secondary" onClick={() => void runLookup(submitted)}>Try again</Button>}
          </ErrorState>
        )}
        {result && <LookupResult result={result} number={submitted} />}
      </div>
    </div>
  );
}
