import { useCallback, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { ImageUp, ScanBarcode, Search } from 'lucide-react';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { PageHeading } from '../../components/PageHeading';
import { StatusMessage } from '../../components/StatusMessage';
import { BarcodeScanner, canUseCameraScanner } from '../../features/scan/BarcodeScanner';
import { decodeImageFile } from '../../features/scan/decode';
import { DemoCodes } from '../../features/scan/DemoCodes';
import { cleanIdentifier } from '../../lib/v3/validate';

export function ScanPage() {
  const navigate = useNavigate();
  const [cameraOpen, setCameraOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [typed, setTyped] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const imageInput = useRef<HTMLInputElement>(null);

  const openProduct = useCallback((identifier: string) => {
    navigate(`/product/${encodeURIComponent(identifier)}`, { state: { fromScan: true } });
  }, [navigate]);

  const handleDetect = useCallback((text: string) => {
    const identifier = cleanIdentifier(text);
    setCameraOpen(false);
    if (identifier) openProduct(identifier);
    else setNotice('We could not use that code. Try again, or type the number under the barcode.');
  }, [openProduct]);

  const handleUnavailable = useCallback(() => {
    setCameraOpen(false);
    setNotice('We could not open the camera. Allow camera access in your browser, choose a photo, or type the number.');
  }, []);

  async function handleImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setNotice(null);
    setReading(true);
    const text = await decodeImageFile(file);
    setReading(false);
    const identifier = text && cleanIdentifier(text);
    if (identifier) openProduct(identifier);
    else setNotice('We could not find a barcode in that photo. Try a sharper photo of just the barcode, or type the number.');
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const identifier = cleanIdentifier(typed);
    if (!identifier) {
      setInputError('Enter the number printed under the barcode.');
      return;
    }
    setInputError(null);
    openProduct(identifier);
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-8 sm:px-6 sm:py-12">
      <PageHeading title="Scan a product">
        Scan the barcode or 2D code on the pack to see what its manufacturer has on record.
      </PageHeading>

      {notice && <div className="mt-6"><StatusMessage tone="warn" title="That did not work" role="alert">{notice}</StatusMessage></div>}

      <div className="mt-6">
        {cameraOpen ? (
          <BarcodeScanner onDetect={handleDetect} onCancel={() => setCameraOpen(false)} onUnavailable={handleUnavailable} />
        ) : (
          <div className="flex flex-col gap-3">
            {canUseCameraScanner() && (
              <Button
                onClick={() => {
                  setNotice(null);
                  setCameraOpen(true);
                }}
              >
                <ScanBarcode aria-hidden="true" className="size-5" />
                Open camera
              </Button>
            )}
            <Button variant="secondary" disabled={reading} onClick={() => imageInput.current?.click()}>
              <ImageUp aria-hidden="true" className="size-5" />
              {reading ? 'Reading the photo' : 'Choose a photo of the barcode'}
            </Button>
            <input ref={imageInput} data-testid="barcode-image" type="file" accept="image/*" hidden onChange={(event) => void handleImage(event)} />
          </div>
        )}
      </div>
      {reading && <p role="status" className="sr-only">Reading the photo</p>}

      <form onSubmit={handleSubmit} noValidate className="mt-8 border-t border-line pt-6">
        <Input
          label="Or type the code"
          hint="The number printed under the barcode."
          value={typed}
          error={inputError}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={256}
          onChange={(event) => setTyped(event.target.value)}
        />
        <Button type="submit" variant="secondary" className="mt-4 w-full">
          <Search aria-hidden="true" className="size-5" />
          Look up this code
        </Button>
      </form>

      <DemoCodes />

      <p className="mt-8 text-center text-sm text-muted">
        No barcode?{' '}
        <Link to="/inspect" className="rounded-sm text-ink underline underline-offset-4">Inspect the packaging</Link>
        {' or '}
        <Link to="/lookup" className="rounded-sm text-ink underline underline-offset-4">look up a NAFDAC number</Link>.
      </p>
    </div>
  );
}
