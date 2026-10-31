import { lazy, Suspense, useCallback, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { QrCode, Search } from 'lucide-react';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { PageHeading } from '../../components/PageHeading';
import { StatusMessage } from '../../components/StatusMessage';
import { canUseCameraScanner, QrScanner } from '../../features/verify/QrScanner';
import { isSampleMode } from '../../lib/api';
import { parsePackIdentifier } from '../../lib/v2/validate';

const SamplePacks = lazy(() => import('../../features/sample/SamplePacks'));

export function ScanPage() {
  const navigate = useNavigate();
  const [cameraOpen, setCameraOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);

  const handleDetect = useCallback((text: string) => {
    const identifier = parsePackIdentifier(text);
    setCameraOpen(false);
    if (identifier) navigate(`/product/${encodeURIComponent(identifier)}`);
    else setNotice('That QR code is not a CounterfeitIQ pack code. Try again, or type the pack ID below.');
  }, [navigate]);

  const handleUnavailable = useCallback(() => {
    setCameraOpen(false);
    setNotice('We could not open the camera. Allow camera access in your browser, or type the pack ID below.');
  }, []);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const identifier = parsePackIdentifier(typed);
    if (!identifier) {
      setInputError('Enter the pack ID printed next to the QR code.');
      return;
    }
    setInputError(null);
    navigate(`/product/${encodeURIComponent(identifier)}`);
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-8 sm:px-6 sm:py-12">
      <PageHeading title="Scan a product">
        Scan the QR code on the pack to see its details. Do not scratch the panel yet.
      </PageHeading>

      {notice && (
        <div className="mt-6"><StatusMessage tone="warn" title="Scan did not work" role="alert">{notice}</StatusMessage></div>
      )}

      <div className="mt-6">
        {cameraOpen ? (
          <QrScanner onDetect={handleDetect} onCancel={() => setCameraOpen(false)} onUnavailable={handleUnavailable} />
        ) : canUseCameraScanner() ? (
          <Button
            className="w-full"
            onClick={() => {
              setNotice(null);
              setCameraOpen(true);
            }}
          >
            <QrCode aria-hidden="true" className="size-5" />
            Open camera
          </Button>
        ) : (
          <StatusMessage tone="neutral" title="Camera scanning is not available here">
            Type the pack ID below instead.
          </StatusMessage>
        )}
      </div>

      <form onSubmit={handleSubmit} noValidate className="mt-8 border-t border-line pt-6">
        <Input
          label="Or type the pack ID"
          hint="Printed next to the QR code."
          value={typed}
          error={inputError}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={64}
          onChange={(event) => setTyped(event.target.value)}
        />
        <Button type="submit" variant="secondary" className="mt-4 w-full">
          <Search aria-hidden="true" className="size-5" />
          Find this pack
        </Button>
      </form>

      {isSampleMode() && <Suspense fallback={null}><SamplePacks /></Suspense>}

      <p className="mt-8 text-center text-sm text-muted">
        No QR code on the pack?{' '}
        <Link to="/inspect" className="rounded-sm text-ink underline underline-offset-4">Inspect the packaging</Link>
        {' or '}
        <Link to="/lookup" className="rounded-sm text-ink underline underline-offset-4">look up a NAFDAC number</Link>.
      </p>
    </div>
  );
}
