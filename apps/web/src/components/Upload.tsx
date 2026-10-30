import { useState, type DragEvent, type ReactNode } from 'react';
import { ImageUp } from 'lucide-react';

interface UploadProps {
  onFile: (file: File) => void;
  children: ReactNode;
}

export function Upload({ onFile, children }: UploadProps) {
  const [dragging, setDragging] = useState(false);

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) onFile(file);
  }

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={`rounded-lg border border-dashed bg-surface px-5 py-10 text-center transition-colors sm:py-14 ${dragging ? 'border-ink' : 'border-[#b9c3cf]'}`}
    >
      <ImageUp aria-hidden="true" className="mx-auto size-7 text-muted" strokeWidth={1.5} />
      <p className="mt-3 font-medium">Photograph the front of the pack</p>
      <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-muted">
        Keep the product name, NAFDAC number and expiry date in view. JPEG, PNG or WebP.
      </p>
      <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">{children}</div>
    </div>
  );
}
