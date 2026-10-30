export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-md bg-line/70 motion-reduce:animate-none ${className}`} />;
}
