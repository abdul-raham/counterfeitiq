import { useEffect, useRef, useState } from 'react';
import { Button } from '../../components/Button';

interface DetectedBarcode {
  rawValue: string;
}

declare global {
  interface Window {
    BarcodeDetector?: new (options: { formats: string[] }) => { detect(source: CanvasImageSource): Promise<DetectedBarcode[]> };
  }
}

const FRAME_INTERVAL_MS = 200;

export function canUseCameraScanner(): boolean {
  return typeof navigator.mediaDevices?.getUserMedia === 'function';
}

async function createDecoder(): Promise<(video: HTMLVideoElement) => Promise<string | null>> {
  if (window.BarcodeDetector) {
    const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
    return async (video) => (await detector.detect(video))[0]?.rawValue ?? null;
  }
  // Safari and Firefox have no BarcodeDetector.
  const { default: jsQR } = await import('jsqr');
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  return async (video) => {
    if (!context || !video.videoWidth) return null;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0);
    const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
    return jsQR(data, width, height)?.data ?? null;
  };
}

interface QrScannerProps {
  onDetect: (text: string) => void;
  onCancel: () => void;
  onUnavailable: () => void;
}

export function QrScanner({ onDetect, onCancel, onUnavailable }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function start() {
      try {
        const media = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' } } });
        if (stopped) {
          media.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = media;
        if (videoRef.current) videoRef.current.srcObject = media;
        const decode = await createDecoder();
        if (stopped) return;
        setScanning(true);

        const tick = async () => {
          if (stopped) return;
          const video = videoRef.current;
          const text = video && video.readyState >= 2 ? await decode(video).catch(() => null) : null;
          if (stopped) return;
          if (text) onDetect(text);
          else timer = setTimeout(() => void tick(), FRAME_INTERVAL_MS);
        };
        void tick();
      } catch {
        if (!stopped) onUnavailable();
      }
    }

    void start();
    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [onDetect, onUnavailable]);

  return (
    <div>
      <div className="relative overflow-hidden rounded-lg border border-line bg-ink">
        <video ref={videoRef} autoPlay muted playsInline aria-label="Camera preview" className="max-h-[60vh] min-h-72 w-full object-cover" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 m-auto size-52 rounded-lg border-2 border-white/80" />
      </div>
      <p role="status" className="mt-3 text-sm text-muted">
        {scanning ? 'Point the camera at the QR code on the pack.' : 'Starting the camera'}
      </p>
      <Button variant="secondary" onClick={onCancel} className="mt-4 w-full sm:w-auto">Cancel</Button>
    </div>
  );
}
