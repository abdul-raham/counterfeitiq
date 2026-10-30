import type { ReactNode } from 'react';

export function ImagePreview({ src, alt, children }: { src: string; alt: string; children?: ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-line bg-[#eef1f5]">
      <img src={src} alt={alt} className="mx-auto max-h-[55vh] w-full object-contain" />
      {children}
    </div>
  );
}
