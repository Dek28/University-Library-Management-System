import clsx from 'clsx';
import { Loader2 } from 'lucide-react';

export default function Spinner({ className, size = 'md' }) {
  const sizes = { sm: 'h-4 w-4', md: 'h-5 w-5', lg: 'h-8 w-8' };
  return <Loader2 className={clsx('animate-spin text-brand-600', sizes[size], className)} aria-hidden="true" />;
}

/** Full-height loader used while a route's first payload is in flight. */
export function PageLoader({ label = 'Loading…' }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3.5" role="status" aria-live="polite">
      <Spinner size="lg" />
      <p className="text-sm text-slate-500">{label}</p>
    </div>
  );
}
