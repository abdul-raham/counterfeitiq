import type { ReactNode } from 'react';
import { errorCopy, type RequestError } from '../lib/errors';
import { StatusMessage } from './StatusMessage';

export function ErrorState({ error, children }: { error: RequestError; children?: ReactNode }) {
  const { title, body } = errorCopy(error.code);
  return (
    <div className="space-y-3">
      <StatusMessage tone="warn" title={title} role="alert">{body}</StatusMessage>
      {children && <div className="flex flex-wrap gap-3">{children}</div>}
    </div>
  );
}
