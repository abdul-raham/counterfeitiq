import type { ReactNode } from 'react';
import { useDocumentTitle } from '../lib/useDocumentTitle';

export function PageHeading({ title, children }: { title: string; children?: ReactNode }) {
  useDocumentTitle(title);
  return (
    <header>
      <h1 tabIndex={-1} className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
      {children && <p className="mt-2 leading-relaxed text-muted">{children}</p>}
    </header>
  );
}
