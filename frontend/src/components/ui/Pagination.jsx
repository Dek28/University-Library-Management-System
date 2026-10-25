import clsx from 'clsx';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PAGE_SIZES } from '../../constants';

/** Page numbers with ellipses, e.g. 1 2 3 ... 12 */
function pageWindow(current, total) {
  if (total <= 7) return Array.from({ length: total }, (unused, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, '…', total];
  if (current >= total - 3) return [1, '…', total - 4, total - 3, total - 2, total - 1, total];
  return [1, '…', current - 1, current, current + 1, '…', total];
}

export default function Pagination({ page = 1, limit = 20, total = 0, onPageChange, onLimitChange, className }) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const first = total === 0 ? 0 : (page - 1) * limit + 1;
  const last = Math.min(page * limit, total);

  const button = 'inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-sm transition-colors duration-100';

  return (
    <div className={clsx('flex flex-wrap items-center justify-between gap-3 px-5 py-3', className)}>
      <p className="text-xs text-slate-500">
        {total === 0 ? 'No entries' : <>Showing <span className="font-medium text-slate-700 tabular">{first}</span>–<span className="font-medium text-slate-700 tabular">{last}</span> of <span className="font-medium text-slate-700 tabular">{total}</span></>}
      </p>

      <div className="flex items-center gap-3">
        {onLimitChange && (
          <label className="hidden items-center gap-2 text-xs text-slate-500 sm:flex">
            Rows
            <select
              value={limit}
              onChange={(e) => onLimitChange(Number(e.target.value))}
              className="h-8 rounded-lg border border-line-strong bg-panel px-2 text-xs text-slate-700 transition focus:border-brand-500 focus:outline-hidden focus:ring-4 focus:ring-brand-500/15"
            >
              {PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
          </label>
        )}

        <nav className="flex items-center gap-1" aria-label="Pagination">
          <button
            type="button"
            className={clsx(button, 'text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-35 disabled:hover:bg-transparent')}
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          {pageWindow(page, totalPages).map((entry, index) =>
            entry === '…' ? (
              <span key={`gap-${index}`} className="px-1 text-slate-400">…</span>
            ) : (
              <button
                key={entry}
                type="button"
                onClick={() => onPageChange(entry)}
                aria-current={entry === page ? 'page' : undefined}
                className={clsx(
                  button,
                  entry === page
                    ? 'bg-slate-900 font-semibold text-panel'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                )}
              >
                {entry}
              </button>
            ))}

          <button
            type="button"
            className={clsx(button, 'text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-35 disabled:hover:bg-transparent')}
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </nav>
      </div>
    </div>
  );
}
