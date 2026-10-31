interface DetectedBarcode {
  rawValue: string;
}

declare global {
  interface Window {
    BarcodeDetector?: {
      new (options: { formats: string[] }): { detect(source: CanvasImageSource): Promise<DetectedBarcode[]> };
      getSupportedFormats?: () => Promise<string[]>;
    };
  }
}

const NATIVE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'data_matrix', 'qr_code'];
const MAX_DECODE_EDGE = 1600;

export type FrameDecoder = (source: HTMLVideoElement | HTMLCanvasElement) => Promise<string | null>;

async function createLibraryDecoder(): Promise<FrameDecoder> {
  const zxing = await import('@zxing/library');
  const reader = new zxing.MultiFormatReader();
  const hints = new Map<unknown, unknown>([
    [zxing.DecodeHintType.POSSIBLE_FORMATS, [
      zxing.BarcodeFormat.EAN_13, zxing.BarcodeFormat.EAN_8, zxing.BarcodeFormat.UPC_A, zxing.BarcodeFormat.UPC_E,
      zxing.BarcodeFormat.CODE_128, zxing.BarcodeFormat.DATA_MATRIX, zxing.BarcodeFormat.QR_CODE,
    ]],
    [zxing.DecodeHintType.TRY_HARDER, true],
  ]);
  reader.setHints(hints as never);
  const canvas = document.createElement('canvas');

  return async (source) => {
    const width = source instanceof HTMLVideoElement ? source.videoWidth : source.width;
    const height = source instanceof HTMLVideoElement ? source.videoHeight : source.height;
    if (!width || !height) return null;
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d', { willReadFrequently: true })?.drawImage(source, 0, 0, width, height);
    const bitmap = new zxing.BinaryBitmap(new zxing.HybridBinarizer(new zxing.HTMLCanvasElementLuminanceSource(canvas)));
    try {
      return reader.decodeWithState(bitmap).getText();
    } catch {
      // The library throws when a frame simply has no barcode in it.
      return null;
    } finally {
      reader.reset();
    }
  };
}

/** Uses the browser's own detector where it handles these formats, and a library otherwise. */
export async function createDecoder(): Promise<FrameDecoder> {
  const Native = window.BarcodeDetector;
  if (Native) {
    const supported = await Native.getSupportedFormats?.().catch(() => []) ?? [];
    const formats = NATIVE_FORMATS.filter((format) => supported.includes(format));
    if (formats.includes('ean_13') && formats.includes('data_matrix')) {
      const detector = new Native({ formats });
      return async (source) => (await detector.detect(source))[0]?.rawValue ?? null;
    }
  }
  return createLibraryDecoder();
}

export async function decodeImageFile(file: File): Promise<string | null> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('unreadable image'));
      image.src = url;
    });
    const scale = Math.min(1, MAX_DECODE_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await (await createDecoder())(canvas);
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
