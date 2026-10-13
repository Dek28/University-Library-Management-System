import { useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';

/**
 * Underlined tab bar.
 * `tabs`: { key, label, count? }. Rendered as real buttons with `role="tab"`
 * so keyboard and screen-reader users get the expected semantics.
 *
 * When the tabs don't fit they scroll sideways; a fade on the clipped edge
 * shows there is more, so a cut-off tab doesn't read as a broken layout.
 */
export default function Tabs({ tabs, value, onChange, className }) {
  const rowRef = useRef(null);
  const [overflow, setOverflow] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const row = rowRef.current;
    if (!row) return;
    setOverflow({
      left: row.scrollLeft > 1,
      right: row.scrollLeft + row.clientWidth < row.scrollWidth - 1,
    });
  }, []);

  useEffect(() => {
    const row = rowRef.current;
    if (!row) return undefined;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    return () => observer.disconnect();
  }, [measure, tabs.length]);

  // Keep the selected tab in view, e.g. one chosen from a link or a count.
  // Only the row scrolls (sideways); scrollIntoView would also move the page.
  useEffect(() => {
    const row = rowRef.current;
    const tab = row?.querySelector('[aria-selected="true"]');
    if (!tab) return;
    const start = tab.offsetLeft;
    const end = start + tab.offsetWidth;
    if (start < row.scrollLeft) row.scrollLeft = start;
    else if (end > row.scrollLeft + row.clientWidth) row.scrollLeft = end - row.clientWidth;
  }, [value]);

  const fade = 'pointer-events-none absolute inset-y-0 w-10 from-panel to-transparent';

  return (
    <div className={clsx('relative border-b border-line', className)} role="tablist">
      <div ref={rowRef} onScroll={measure} className="relative -mb-px flex gap-1 overflow-x-auto scrollbar-none">
        {tabs.map((tab) => {
          const active = tab.key === value;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(tab.key)}
              className={clsx(
                'flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3.5 pb-2.5 pt-2 text-base font-medium transition-colors duration-100',
                active
                  ? 'border-brand-600 text-slate-900'
                  : 'border-transparent text-slate-500 hover:border-line-strong hover:text-slate-800',
              )}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span className={clsx(
                  'rounded px-1.5 py-0.5 text-2xs font-semibold tabular',
                  active ? 'bg-brand-50 text-brand-700' : 'bg-slate-100 text-slate-500',
                )}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {overflow.left && <div className={clsx(fade, 'left-0 bg-linear-to-r')} aria-hidden="true" />}
      {overflow.right && <div className={clsx(fade, 'right-0 bg-linear-to-l')} aria-hidden="true" />}
    </div>
  );
}
