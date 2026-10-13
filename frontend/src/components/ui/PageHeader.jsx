import { Fragment } from 'react';
import { Link } from 'react-router';
import { ChevronRight } from 'lucide-react';
import clsx from 'clsx';

/**
 * Page title with breadcrumbs and an action slot.
 * Breadcrumb entries: { label, to? }. The last one is rendered as current.
 */
export default function PageHeader({ title, breadcrumbs = [], actions, description, className }) {
  return (
    <div className={clsx('mb-6 flex flex-wrap items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        {breadcrumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className="mb-1.5 flex flex-wrap items-center gap-1 text-xs text-slate-500">
            {breadcrumbs.map((crumb, index) => (
              <Fragment key={`${crumb.label}-${index}`}>
                {index > 0 && <ChevronRight className="h-3 w-3 text-slate-400" aria-hidden="true" />}
                {crumb.to && index < breadcrumbs.length - 1 ? (
                  <Link to={crumb.to} className="underline-offset-2 transition-colors hover:text-slate-800 hover:underline">
                    {crumb.label}
                  </Link>
                ) : (
                  <span aria-current={index === breadcrumbs.length - 1 ? 'page' : undefined} className="text-slate-500">
                    {crumb.label}
                  </span>
                )}
              </Fragment>
            ))}
          </nav>
        )}

        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>

        {description && <p className="mt-2 max-w-2xl text-base leading-relaxed text-slate-500">{description}</p>}
      </div>

      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
