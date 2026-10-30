import type { ButtonHTMLAttributes } from 'react';
import { Link, type LinkProps } from 'react-router';

type Variant = 'primary' | 'secondary' | 'quiet';

const base = 'inline-flex min-h-12 items-center justify-center gap-2 rounded-lg px-5 text-[0.95rem] font-medium transition-colors disabled:opacity-50';
const variants: Record<Variant, string> = {
  primary: 'bg-ink text-white hover:bg-ink-hover',
  secondary: 'border border-line bg-surface text-ink hover:border-ink/40',
  quiet: 'text-ink underline-offset-4 hover:underline',
};

function classes(variant: Variant, className = '') {
  return `${base} ${variants[variant]} ${className}`;
}

export function Button({
  variant = 'primary',
  className,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button type={type} className={classes(variant, className)} {...props} />;
}

export function ButtonLink({ variant = 'primary', className, ...props }: LinkProps & { variant?: Variant }) {
  return <Link className={classes(variant, className)} {...props} />;
}
