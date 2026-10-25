import clsx from 'clsx';
import { Link } from 'react-router';

export default function Card({ title, subtitle, actions, footer, className, bodyClassName, children, noPadding = false }) {
  return (
    <section className={clsx('card', className)}>
      {(title || actions) && (
        <header className="card-header">
          <div className="min-w-0">
            {title && <h2 className="card-title truncate">{title}</h2>}
            {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={clsx(!noPadding && 'p-5', bodyClassName)}>{children}</div>
      {footer && <div className="border-t border-line px-5 py-3">{footer}</div>}
    </section>
  );
}

/** Accent dot colours, used only where the tone carries meaning. */
const TONE_DOTS = {
  blue: 'bg-brand-500',
  amber: 'bg-amber-500',
  green: 'bg-emerald-500',
  red: 'bg-red-500',
  purple: 'bg-purple-600',
  slate: 'bg-slate-300',
};

/**
 * Dashboard metric tile: label, value, and an optional link.
 *
 * The number is the point, so it gets the weight and the room. The tone shows
 * as a small dot beside the label rather than a bar down the side, enough to
 * group tiles by meaning without drawing a frame around every figure.
 *
 * Values are pre-aggregated by the API. The tile never computes anything.
 */
export function StatCard({
  label, value, tone = 'slate', to, linkLabel = 'View all', hint, loading = false, compact = false,
}) {
  return (
    <div className={clsx('card group transition-colors duration-100 hover:border-line-strong', compact ? 'px-4 py-3' : 'px-5 py-4')}>
      <div className="flex items-center gap-2">
        <span
          className={clsx('h-1.5 w-1.5 shrink-0 rounded-full', TONE_DOTS[tone] || TONE_DOTS.slate)}
          aria-hidden="true"
        />
        <p className="truncate text-xs font-medium uppercase tracking-wider text-slate-500">{label}</p>
      </div>

      {loading ? (
        <div className={clsx('skeleton', compact ? 'mt-2 h-6 w-16' : 'mt-3 h-8 w-24')} />
      ) : (
        <p className={clsx('font-semibold leading-none text-slate-900 tabular', compact ? 'mt-1.5 text-xl' : 'mt-2 text-3xl')}>
          {value}
        </p>
      )}

      {hint && <p className={clsx('text-xs text-slate-500', compact ? 'mt-1' : 'mt-2')}>{hint}</p>}

      {to && (
        <Link
          to={to}
          className={clsx('inline-block font-medium text-brand-600 underline-offset-4 hover:text-brand-700 hover:underline', compact ? 'mt-1.5 text-xs' : 'mt-3 text-sm')}
        >
          {linkLabel}
        </Link>
      )}
    </div>
  );
}

/** What callers pass for "no value": nothing, blank, or the "-" placeholder. */
const isBlank = (value) => value === null || value === undefined || value === false
  || (typeof value === 'string' && (value.trim() === '' || value.trim() === '-'));

/**
 * Label/value row used on detail pages. A row with no value is left out
 * entirely, so pages list what is known rather than a column of dashes.
 * Pass `keepEmpty` where an empty value is itself worth showing.
 */
export function DetailRow({ label, children, className, keepEmpty = false }) {
  if (isBlank(children) && !keepEmpty) return null;
  return (
    <div className={clsx('flex gap-4 border-b border-line py-2.5 last:border-b-0', className)}>
      {/* Narrow enough to leave the value room in a side column; long values (emails) wrap. */}
      <dt className="w-32 shrink-0 text-sm text-slate-500">{label}</dt>
      <dd className="min-w-0 flex-1 wrap-break-word text-base font-medium text-slate-800">{isBlank(children) ? '-' : children}</dd>
    </div>
  );
}
