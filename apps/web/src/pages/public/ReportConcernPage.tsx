import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { Button, ButtonLink } from '../../components/Button';
import { ErrorState } from '../../components/ErrorState';
import { Input } from '../../components/Input';
import { PageHeading } from '../../components/PageHeading';
import { StatusMessage } from '../../components/StatusMessage';
import { toRequestError, type RequestError } from '../../lib/errors';
import { createInvestigation } from '../../lib/v2/client';
import type { AuthenticationOutcome } from '../../lib/v2/contract';
import { AUTHENTICATION_OUTCOMES, parsePackIdentifier } from '../../lib/v2/validate';

export function ReportConcernPage() {
  const [params] = useSearchParams();
  const rawOutcome = params.get('outcome') as AuthenticationOutcome | null;
  const outcome = rawOutcome && AUTHENTICATION_OUTCOMES.includes(rawOutcome) ? rawOutcome : null;
  const [pack, setPack] = useState(params.get('pack') ?? '');
  const [notes, setNotes] = useState('');
  const [notesError, setNotesError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<RequestError | null>(null);
  const [reference, setReference] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (sending) return;
    const text = notes.trim();
    if (text.length < 5) {
      setNotesError('Tell us briefly what concerned you.');
      return;
    }
    setNotesError(null);
    setError(null);
    setSending(true);
    try {
      const created = await createInvestigation({
        publicIdentifier: parsePackIdentifier(pack),
        authenticationOutcome: outcome,
        aiAnalysis: null,
        notes: text,
      });
      setReference(created.id);
    } catch (caught) {
      setError(toRequestError(caught));
    } finally {
      setSending(false);
    }
  }

  if (reference) {
    return (
      <div className="mx-auto max-w-xl px-4 py-8 sm:px-6 sm:py-12">
        <PageHeading title="Report received" />
        <div className="mt-6">
          <StatusMessage tone="accent" title="Thank you. We have your report." role="status">
            Your reference is <span className="font-medium">{reference}</span>. If you are worried about your health, speak to a pharmacist or doctor now.
          </StatusMessage>
        </div>
        <ButtonLink to="/scan" variant="secondary" className="mt-6 w-full">Scan another product</ButtonLink>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-8 sm:px-6 sm:py-12">
      <PageHeading title="Report a concern">
        Tell us about a pack that worries you. You do not need an account, and a report is not an accusation.
      </PageHeading>

      {error && <div className="mt-6"><ErrorState error={error} /></div>}

      <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
        <Input label="Pack ID (optional)" value={pack} autoComplete="off" spellCheck={false} maxLength={64} onChange={(event) => setPack(event.target.value)} />
        <div>
          <label htmlFor="concern-notes" className="block text-sm font-medium">What concerned you?</label>
          <p id="concern-notes-hint" className="mt-1 text-sm text-muted">Include where you bought it if you can. Please do not include personal health details.</p>
          <textarea
            id="concern-notes"
            rows={5}
            maxLength={2000}
            value={notes}
            aria-invalid={notesError ? true : undefined}
            aria-describedby={notesError ? 'concern-notes-hint concern-notes-error' : 'concern-notes-hint'}
            className={`mt-2 block w-full rounded-lg border bg-surface px-4 py-3 text-base ${notesError ? 'border-risk' : 'border-line'}`}
            onChange={(event) => setNotes(event.target.value)}
          />
          {notesError && <p id="concern-notes-error" className="mt-2 text-sm text-risk">{notesError}</p>}
        </div>
        <Button type="submit" disabled={sending} className="w-full">{sending ? 'Sending' : 'Send report'}</Button>
      </form>
    </div>
  );
}
