import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { ShieldCheck } from 'lucide-react';
import { Button, ButtonLink } from '../../components/Button';
import { ErrorState } from '../../components/ErrorState';
import { Input } from '../../components/Input';
import { PageHeading } from '../../components/PageHeading';
import { StatusMessage } from '../../components/StatusMessage';
import { useVerify } from '../../features/verify/VerifyContext';
import { isAbort, toRequestError, type RequestError } from '../../lib/errors';
import { authenticatePack } from '../../lib/v2/client';
import { cleanSecretCode, parsePackIdentifier } from '../../lib/v2/validate';

export function AuthenticatePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { setResult } = useVerify();
  const identifier = parsePackIdentifier(params.get('pack') ?? '');
  const [code, setCode] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<RequestError | null>(null);
  const [failedAttempt, setFailedAttempt] = useState(false);
  const request = useRef<AbortController | null>(null);

  useEffect(() => () => request.current?.abort(), []);

  if (!identifier) return <Navigate to="/scan" replace />;
  const packIdentifier = identifier;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    // A code can only be first-checked once, so a second tap must not send it again.
    if (submitting) return;
    const secret = cleanSecretCode(code);
    if (!secret) {
      setInputError('Enter the code from the scratch panel.');
      return;
    }
    setInputError(null);
    setError(null);
    setSubmitting(true);
    const controller = new AbortController();
    request.current = controller;
    try {
      const response = await authenticatePack(packIdentifier, secret, controller.signal);
      setResult({ publicIdentifier: packIdentifier, response, afterFailedAttempt: failedAttempt });
      navigate('/verification/result');
    } catch (caught) {
      if (isAbort(caught)) return;
      // The request may have reached the server before the connection failed.
      setFailedAttempt(true);
      setError(toRequestError(caught));
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-8 sm:px-6 sm:py-12">
      <PageHeading title="Enter secret code">
        Scratch the hidden panel on the pack and type the code you find.
      </PageHeading>
      <p className="mt-2 text-sm text-muted">Pack ID: <span className="font-medium text-ink">{packIdentifier}</span></p>

      {error && (
        <div className="mt-6">
          <ErrorState error={error} />
          <p className="mt-3 text-sm text-muted">
            Your code may already have been received. If you try again and it says the code was checked before, that may be from this attempt.
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="mt-6">
        <Input
          label="Secret code"
          value={code}
          error={inputError}
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          maxLength={64}
          disabled={submitting}
          onChange={(event) => setCode(event.target.value)}
        />
        <div className="mt-4">
          <StatusMessage tone="neutral" title="Check the code only once">
            Each check is recorded, and a later check of the same code will show as a repeat.
          </StatusMessage>
        </div>
        <Button type="submit" disabled={submitting} className="mt-4 w-full">
          <ShieldCheck aria-hidden="true" className="size-5" />
          {submitting ? 'Checking the code' : 'Check code'}
        </Button>
      </form>
      {submitting && <p role="status" className="sr-only">Checking the code</p>}
      <ButtonLink to={`/product/${encodeURIComponent(packIdentifier)}`} variant="quiet" className="mt-3 w-full">Back to product details</ButtonLink>
    </div>
  );
}
