import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { ACCEPTED_IMAGE_TYPES } from '@counterfeitiq/shared';
import { Camera, ImagePlus, RefreshCw, ScanSearch } from 'lucide-react';
import { Button } from '../components/Button';
import { ErrorState } from '../components/ErrorState';
import { ImagePreview } from '../components/ImagePreview';
import { PageHeading } from '../components/PageHeading';
import { Skeleton } from '../components/Skeleton';
import { StatusMessage } from '../components/StatusMessage';
import { Upload } from '../components/Upload';
import { AnalysisState } from '../features/scanner/AnalysisState';
import { CameraCapture, isCameraApiAvailable } from '../features/scanner/CameraCapture';
import { useScan } from '../features/scanner/ScanContext';

const ACCEPT = ACCEPTED_IMAGE_TYPES.join(',');

export function InspectPage() {
  const navigate = useNavigate();
  const { file, previewUrl, phase, error, selectFile, analyze, cancel } = useScan();
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraFailed, setCameraFailed] = useState(false);
  const captureInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);

  // Leaving this page stops any request in flight.
  useEffect(() => cancel, [cancel]);

  // The button that was focused disappears when analysis starts or ends.
  const wasAnalyzing = useRef(false);
  useEffect(() => {
    const analyzing = phase === 'analyzing';
    if (analyzing === wasAnalyzing.current) return;
    wasAnalyzing.current = analyzing;
    document.querySelector<HTMLElement>('main h1')?.focus();
  }, [phase]);

  const handleCameraUnavailable = useCallback(() => {
    setCameraOpen(false);
    setCameraFailed(true);
  }, []);

  function takePhoto() {
    setCameraFailed(false);
    if (isCameraApiAvailable()) setCameraOpen(true);
    else captureInput.current?.click();
  }

  function chooseImage() {
    setCameraFailed(false);
    galleryInput.current?.click();
  }

  function handleInput(event: ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0];
    // Cleared so that choosing the same file again still fires a change event.
    event.target.value = '';
    if (chosen) void selectFile(chosen);
  }

  async function handleAnalyze() {
    if (await analyze()) navigate('/inspect/report');
  }

  const inputs = (
    <>
      <input ref={captureInput} data-testid="capture-input" type="file" accept={ACCEPT} capture="environment" hidden onChange={handleInput} />
      <input ref={galleryInput} data-testid="gallery-input" type="file" accept={ACCEPT} hidden onChange={handleInput} />
    </>
  );

  if (phase === 'analyzing') {
    return (
      <div className="mx-auto max-w-xl px-4 py-8 sm:px-6 sm:py-12">
        <PageHeading title="Inspecting the packaging" />
        <div className="mt-6"><AnalysisState previewUrl={previewUrl} onCancel={cancel} /></div>
      </div>
    );
  }

  const canRetry = Boolean(file) && error?.retryable;

  return (
    <div className="mx-auto max-w-xl px-4 py-8 sm:px-6 sm:py-12">
      {inputs}
      <PageHeading title="Inspect packaging">
        Optional. An AI reads the packaging and compares it with registration records. This is separate from checking a scratch code. Nothing is uploaded until you press Check this product.
      </PageHeading>

      {error && (
        <div className="mt-6">
          <ErrorState error={error}>
            {canRetry && (
              <Button onClick={handleAnalyze}>
                <RefreshCw aria-hidden="true" className="size-4" />
                Try again
              </Button>
            )}
          </ErrorState>
        </div>
      )}

      {cameraFailed && (
        <div className="mt-6 space-y-3">
          <StatusMessage tone="warn" title="We could not open the camera" role="alert">
            Allow camera access in your browser settings, or use your device's camera app instead.
          </StatusMessage>
          <Button variant="secondary" onClick={() => captureInput.current?.click()}>
            <Camera aria-hidden="true" className="size-5" />
            Use device camera
          </Button>
        </div>
      )}

      <div className="mt-6">
        {cameraOpen ? (
          <CameraCapture
            onCapture={(photo) => {
              setCameraOpen(false);
              void selectFile(photo);
            }}
            onCancel={() => setCameraOpen(false)}
            onUnavailable={handleCameraUnavailable}
          />
        ) : phase === 'preparing' ? (
          <div role="status">
            <Skeleton className="h-72 w-full" />
            <p className="mt-3 text-sm text-muted">Preparing your photo</p>
          </div>
        ) : file && previewUrl ? (
          <div>
            <ImagePreview src={previewUrl} alt="The photo you selected" />
            <Button onClick={handleAnalyze} className="mt-4 w-full">
              <ScanSearch aria-hidden="true" className="size-5" />
              Check this product
            </Button>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Button variant="secondary" onClick={takePhoto}>
                <Camera aria-hidden="true" className="size-4" />
                Retake
              </Button>
              <Button variant="secondary" onClick={chooseImage}>
                <ImagePlus aria-hidden="true" className="size-4" />
                Replace
              </Button>
            </div>
          </div>
        ) : (
          <Upload onFile={(dropped) => void selectFile(dropped)}>
            <Button onClick={takePhoto}>
              <Camera aria-hidden="true" className="size-5" />
              Take a photo
            </Button>
            <Button variant="secondary" onClick={chooseImage}>
              <ImagePlus aria-hidden="true" className="size-5" />
              Choose an image
            </Button>
          </Upload>
        )}
      </div>

      <p className="mt-6 text-center text-sm text-muted">
        Have the number already?{' '}
        <Link to="/lookup" className="rounded-sm text-ink underline underline-offset-4">Enter NAFDAC number</Link>
      </p>
    </div>
  );
}
