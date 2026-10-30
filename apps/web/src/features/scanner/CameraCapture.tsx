import { useEffect, useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import { Button } from '../../components/Button';

export function isCameraApiAvailable(): boolean {
  return typeof navigator.mediaDevices?.getUserMedia === 'function';
}

interface CameraCaptureProps {
  onCapture: (file: File) => void;
  onCancel: () => void;
  onUnavailable: () => void;
}

export function CameraCapture({ onCapture, onCancel, onUnavailable }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopped = false;

    navigator.mediaDevices
      .getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1440 } },
      })
      .then((media) => {
        if (stopped) {
          media.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = media;
        if (videoRef.current) videoRef.current.srcObject = media;
      })
      .catch(() => {
        if (!stopped) onUnavailable();
      });

    return () => {
      stopped = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [onUnavailable]);

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (blob) onCapture(new File([blob], 'camera-photo.jpg', { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.92);
  }

  return (
    <div>
      <div className="overflow-hidden rounded-lg border border-line bg-ink">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          aria-label="Camera preview"
          onLoadedMetadata={() => setReady(true)}
          className="max-h-[60vh] min-h-64 w-full object-contain"
        />
      </div>
      <p className="mt-3 text-sm text-muted">Hold steady, with the product name and NAFDAC number in the frame.</p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <Button onClick={capture} disabled={!ready} className="sm:flex-1">
          <Camera aria-hidden="true" className="size-5" />
          Capture photo
        </Button>
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
