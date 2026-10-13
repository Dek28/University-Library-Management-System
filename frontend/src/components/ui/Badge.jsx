import clsx from 'clsx';
import { humanize } from '../../utils/format';

/**
 * Tinted chips, not outlined ones. A ring around a two-word status adds a
 * second edge for no extra meaning, so the tint carries it alone.
 */
const TONES = {
  green: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700',
  red: 'bg-red-50 text-red-700',
  blue: 'bg-brand-50 text-brand-700',
  slate: 'bg-slate-100 text-slate-600',
  purple: 'bg-purple-50 text-purple-700',
};

const DOTS = {
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
  blue: 'bg-brand-500',
  slate: 'bg-slate-400',
  purple: 'bg-purple-600',
};

export default function Badge({ tone = 'slate', children, className, dot = false }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium',
        TONES[tone] || TONES.slate,
        className,
      )}
    >
      {dot && <span className={clsx('h-1.5 w-1.5 rounded-full', DOTS[tone] || DOTS.slate)} aria-hidden="true" />}
      {children}
    </span>
  );
}

/**
 * Maps a domain status to a consistent colour everywhere it appears, so
 * "overdue" always reads the same whether it is a loan, a fine or a copy.
 */
const STATUS_TONES = {
  available: 'green', active: 'green', paid: 'green', cleared: 'green', returned: 'green',
  present: 'green', completed: 'green', published: 'green', found: 'green', excellent: 'green', good: 'green',

  borrowed: 'amber', pending: 'amber', partially_paid: 'amber', reserved: 'amber', planned: 'amber',
  ready: 'amber', under_repair: 'amber', fair: 'amber', excused: 'amber', misplaced: 'amber',

  overdue: 'red', lost: 'red', missing: 'red', damaged: 'red', severely_damaged: 'red',
  suspended: 'red', blocked: 'red', rejected: 'red', outstanding: 'red', inactive: 'red', absent: 'red',

  withdrawn: 'slate', archived: 'slate', cancelled: 'slate', expired: 'slate',
  not_requested: 'slate', waived: 'slate', graduated: 'slate', reference_only: 'blue',
  under_maintenance: 'amber', digital_only: 'blue', restricted: 'purple',

  // Purchase orders and supplier invoices.
  draft: 'slate', ordered: 'blue', partially_received: 'amber', received: 'green', unpaid: 'red',
};

export function StatusBadge({ status, className, dot = false }) {
  if (!status) return <span className="text-slate-400">-</span>;
  return (
    <Badge tone={STATUS_TONES[status] || 'slate'} className={className} dot={dot}>
      {humanize(status)}
    </Badge>
  );
}
