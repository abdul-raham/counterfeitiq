import { useId, type InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string | null;
}

export function Input({ label, hint, error, className = '', ...props }: InputProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-medium">{label}</label>
      {hint && <p id={hintId} className="mt-1 text-sm text-muted">{hint}</p>}
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
        className={`mt-2 block min-h-12 w-full rounded-lg border bg-surface px-4 text-base placeholder:text-muted/70 ${error ? 'border-risk' : 'border-line'}`}
        {...props}
      />
      {error && <p id={errorId} className="mt-2 text-sm text-risk">{error}</p>}
    </div>
  );
}
