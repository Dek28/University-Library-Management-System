import clsx from 'clsx';
import { ArrowUpDown, ArrowUp, ArrowDown, Inbox, AlertCircle } from 'lucide-react';
import Button from './Button';

/** Loading placeholder that keeps the table's shape while data arrives. */
function TableSkeleton({ columns, rows = 6 }) {
  return Array.from({ length: rows }).map((unused, rowIndex) => (
    <tr key={rowIndex}>
      {columns.map((column, colIndex) => (
        <td key={column.key || colIndex} className="border-b border-line px-4 py-3">
          <div className="skeleton h-4" style={{ width: `${45 + ((rowIndex + colIndex) % 4) * 15}%` }} />
        </td>
      ))}
    </tr>
  ));
}

export function EmptyState({ icon: Icon = Inbox, title, description, action, className }) {
  return (
    <div className={clsx('flex flex-col items-center justify-center px-6 py-16 text-center', className)}>
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <p className="text-base font-semibold text-slate-800">{title}</p>
      {description && <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-slate-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry, className }) {
  return (
    <div className={clsx('flex flex-col items-center justify-center px-6 py-16 text-center', className)}>
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 text-red-600">
        <AlertCircle className="h-5 w-5" aria-hidden="true" />
      </span>
      <p className="text-base font-semibold text-slate-800">Could not load this data</p>
      <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-slate-500">{message}</p>
      {onRetry && <Button variant="secondary" size="sm" className="mt-5" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

/**
 * Table with server-side sorting hooks, loading/empty/error states and a
 * mobile card fallback.
 *
 * `columns` entries: { key, header, render?, sortable?, align?, width?, hideOnMobile?, primary?, hideWhenEmpty? }
 * `primary` marks the field used as the heading of the mobile card.
 * `hideWhenEmpty` drops the column when `row[key]` is empty on every row shown,
 * so an optional field nobody has filled in doesn't become a column of dashes.
 */
const isEmptyValue = (value) => value === null || value === undefined || value === ''
  || (Array.isArray(value) && value.length === 0);

export default function DataTable({
  columns: allColumns,
  rows = [],
  loading = false,
  error = null,
  onRetry,
  sort,
  onSortChange,
  emptyTitle = 'Nothing to show yet',
  emptyDescription,
  emptyAction,
  rowKey = (row) => row.id,
  onRowClick,
  className,
}) {
  // While loading there are no rows to judge by, so every column stays.
  const columns = loading
    ? allColumns
    : allColumns.filter((column) => !column.hideWhenEmpty || rows.some((row) => !isEmptyValue(row[column.key])));

  const align = (a) => (a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left');

  const toggleSort = (key) => {
    if (!onSortChange) return;
    const isCurrent = sort?.field === key;
    onSortChange({ field: key, direction: isCurrent && sort.direction === 'asc' ? 'desc' : 'asc' });
  };

  const sortIcon = (key) => {
    if (sort?.field !== key) return <ArrowUpDown className="h-3.5 w-3.5 text-slate-300" aria-hidden="true" />;
    return sort.direction === 'asc'
      ? <ArrowUp className="h-3.5 w-3.5 text-brand-600" aria-hidden="true" />
      : <ArrowDown className="h-3.5 w-3.5 text-brand-600" aria-hidden="true" />;
  };

  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (!loading && rows.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />;
  }

  const primaryColumn = columns.find((c) => c.primary) || columns[0];

  return (
    <div className={className}>
      {/* Desktop and tablet: a real table, horizontally scrollable if needed. */}
      <div className="table-wrap hidden sm:block">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={clsx(align(column.align), column.hideOnMobile && 'hidden lg:table-cell')}
                  style={column.width ? { width: column.width } : undefined}
                  aria-sort={sort?.field === column.key ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  {column.sortable && onSortChange ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(column.key)}
                      className="inline-flex items-center gap-1.5 uppercase tracking-[0.06em] transition-colors hover:text-slate-800"
                    >
                      {column.header}
                      {sortIcon(column.key)}
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableSkeleton columns={columns} />
            ) : (
              rows.map((row, rowIndex) => (
                <tr
                  key={rowKey(row, rowIndex)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={onRowClick ? 'cursor-pointer' : undefined}
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={clsx(align(column.align), column.hideOnMobile && 'hidden lg:table-cell')}
                    >
                      {column.render ? column.render(row) : row[column.key] ?? '-'}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile: each row becomes a stacked card so nothing is cut off. */}
      <ul className="divide-y divide-line sm:hidden">
        {loading
          ? Array.from({ length: 4 }).map((unused, index) => (
            <li key={index} className="space-y-2 p-4">
              <div className="skeleton h-4 w-2/3" />
              <div className="skeleton h-3 w-1/2" />
            </li>
          ))
          : rows.map((row, rowIndex) => (
            <li
              key={rowKey(row, rowIndex)}
              className={clsx('px-4 py-3.5', onRowClick && 'cursor-pointer active:bg-slate-50')}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {/* A column renderer may return block markup, so this wrapper
                  must not be a <p>. */}
              <div className="mb-2.5 text-base font-semibold text-slate-900">
                {primaryColumn.render ? primaryColumn.render(row) : row[primaryColumn.key]}
              </div>
              <dl className="space-y-2">
                {columns.filter((c) => c.key !== primaryColumn.key).map((column) => (
                  <div key={column.key} className="flex items-start justify-between gap-3">
                    <dt className="text-xs text-slate-500">{column.header}</dt>
                    <dd className="text-right text-sm font-medium text-slate-800">
                      {column.render ? column.render(row) : row[column.key] ?? '-'}
                    </dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
      </ul>
    </div>
  );
}
