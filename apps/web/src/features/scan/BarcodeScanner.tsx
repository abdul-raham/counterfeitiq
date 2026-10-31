import { useEffect, useRef, useState } from 'react';
import { Button } from '../../components/Button';
import { createDecoder } from './decode';

const FRAME_INTERVAL_MS = 200;

export function canUseCameraScanner(): boolean {
  return typeof navigator.mediaDevices?.getUserMedia === 'function';
}

interface BarcodeScannerProps {
  onDetect: (text: string) => void;
  onCancel: () => void;
  onUnavailable: () => void;
}

export function BarcodeScanner({ onDetect, onCancel, onUnavailable }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function start() {
      try {
        const media = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
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
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-6 inset-y-12 rounded-lg border-2 border-white/80" />
      </div>
      <p role="status" className="mt-3 text-sm text-muted">
        {scanning ? 'Hold the QR code inside the frame.' : 'Starting the camera'}
      </p>
      <Button variant="secondary" onClick={onCancel} className="mt-4 w-full sm:w-auto">Cancel</Button>
    </div>
  );
}
