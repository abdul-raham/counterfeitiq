import { MAX_IMAGE_BYTES, validateImageFile } from '@counterfeitiq/shared';
import { RequestError } from '../../lib/errors';

// Phone cameras routinely exceed the upload limit, so large photos are reduced
// on the device instead of being rejected. Sizes stay high enough for small print.
const ATTEMPTS = [
  { maxEdge: 2400, quality: 0.85 },
  { maxEdge: 1800, quality: 0.8 },
  { maxEdge: 1400, quality: 0.75 },
];

function loadImage(file: File): Promise<{ image: HTMLImageElement; release: () => void }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve({ image, release: () => URL.revokeObjectURL(url) });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new RequestError('UNREADABLE_IMAGE', false));
    };
    image.src = url;
  });
}

function toJpeg(image: HTMLImageElement, maxEdge: number, quality: number): Promise<Blob | null> {
  const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);
  canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

export async function prepareImage(file: File): Promise<File> {
  const invalid = validateImageFile(file);
  if (!invalid) return file;
  if (invalid.code !== 'FILE_TOO_LARGE') throw new RequestError(invalid.code, invalid.retryable);

  const { image, release } = await loadImage(file);
  try {
    for (const { maxEdge, quality } of ATTEMPTS) {
      const blob = await toJpeg(image, maxEdge, quality);
      if (blob && blob.size <= MAX_IMAGE_BYTES) {
        return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
      }
    }
  } finally {
    release();
  }
  throw new RequestError('FILE_TOO_LARGE', false);
}
