import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import clsx from 'clsx';
import { BookOpen, GraduationCap, Search } from 'lucide-react';
import { dashboardApi } from '../../api/endpoints';
import { Card, StatCard, PageHeader, ErrorState, Button, StatusBadge, Badge } from '../../components/ui';
import { formatMoney, formatNumber, formatDate, daysUntil, humanize } from '../../utils/format';
import { useAuthStore } from '../../store/auth';
import useFinesEnabled from '../../hooks/useFinesEnabled';

/** Colour-codes how close a loan is to its due date. */
function DueChip({ dueDate }) {
  const remaining = daysUntil(dueDate);
  if (remaining < 0) return <Badge tone="red">{Math.abs(remaining)} day(s) overdue</Badge>;
  if (remaining === 0) return <Badge tone="amber">Due today</Badge>;
  if (remaining <= 3) return <Badge tone="amber">Due in {remaining} day(s)</Badge>;
  return <Badge tone="slate">Due in {remaining} day(s)</Badge>;
}

export default function MemberDashboard() {
  const user = useAuthStore((state) => state.user);
  const settings = useAuthStore((state) => state.settings);
  const symbol = settings?.locale?.currencySymbol || '$';
  const finesEnabled = useFinesEnabled();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['dashboard', 'me'],
    queryFn: dashboardApi.me,
    staleTime: 30_000,
  });

  if (error) return <ErrorState message={error.message} onRetry={refetch} />;

  const cards = data?.cards || {};
  const lists = data?.lists || {};

  return (
    <>
      <PageHeader
        title={`Welcome back, ${user?.firstName || ''}`}
        breadcrumbs={[{ label: 'Dashboard' }]}
        actions={<Button as={Link} to="/catalog">Search the catalogue</Button>}
      />

      <div className={`grid gap-3 sm:grid-cols-2 ${finesEnabled ? 'xl:grid-cols-4' : 'xl:grid-cols-3'}`}>
        <StatCard compact label="Active loans" value={formatNumber(cards.activeLoans)} tone="blue" to="/my/borrowing" loading={isLoading} />
        <StatCard compact label="Due soon" value={formatNumber(cards.dueSoon)} tone="amber" to="/my/borrowing" loading={isLoading} />
        <StatCard compact label="Overdue" value={formatNumber(cards.overdue)} tone="red" to="/my/borrowing" loading={isLoading} />
        {finesEnabled && (
          <StatCard compact label="Fine balance" value={formatMoney(cards.fineBalance, symbol)} tone={cards.fineBalance > 0 ? 'red' : 'green'} to="/my/fines" loading={isLoading} />
        )}
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-3">
        <Card
          title="Items you have borrowed"
          className="xl:col-span-2"
          actions={<Button as={Link} to="/my/borrowing" variant="secondary" size="sm">View all</Button>}
          noPadding
        >
          <ul className="divide-y divide-line">
            {(lists.loans || []).map((loan) => (
              <li key={loan._id || loan.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="flex h-10 w-8 shrink-0 items-center justify-center rounded bg-slate-100 text-slate-400">
                  <BookOpen className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">{loan.resource?.title}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {loan.copy?.accessionNumber} · due {formatDate(loan.dueDate)}
                  </p>
                </div>
                <DueChip dueDate={loan.dueDate} />
              </li>
            ))}
            {!isLoading && !(lists.loans || []).length && (
              <li className="px-4 py-5 text-center text-sm text-slate-500">
                You have nothing on loan right now.
              </li>
            )}
          </ul>
        </Card>

        <div className="space-y-4">
          <Card title="Library clearance">
            <div className="flex items-center gap-3">
              <span className={clsx(
                'flex h-10 w-10 items-center justify-center rounded-lg',
                cards.clearanceStatus === 'cleared' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500',
              )}
              >
                <GraduationCap className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <StatusBadge status={cards.clearanceStatus} />
                <p className="mt-1 text-xs text-slate-500">
                  {cards.clearanceStatus === 'cleared'
                    ? 'You have no outstanding library obligations.'
                    : (finesEnabled ? 'Settle any loans and fines before requesting clearance.' : 'Return any loans before requesting clearance.')}
                </p>
              </div>
            </div>
            <Button as={Link} to="/my/clearance" variant="secondary" size="sm" className="mt-3 w-full">
              Open clearance
            </Button>
          </Card>

          <Card title="Reservations" noPadding>
            <ul className="divide-y divide-line">
              {(lists.reservations || []).map((reservation) => (
                <li key={reservation._id || reservation.id} className="px-4 py-2">
                  <p className="truncate text-sm font-medium text-slate-800">{reservation.resource?.title}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <StatusBadge status={reservation.status} />
                    {reservation.expiresAt && (
                      <span className="text-2xs text-slate-500">collect by {formatDate(reservation.expiresAt)}</span>
                    )}
                  </div>
                </li>
              ))}
              {!isLoading && !(lists.reservations || []).length && (
                <li className="px-4 py-5 text-center text-sm text-slate-500">No active reservations.</li>
              )}
            </ul>
          </Card>
        </div>
      </div>

      <Card
        className="mt-3"
        title="Recommended for you"
        subtitle="Based on the subjects you have borrowed from"
        actions={<Button as={Link} to="/catalog" variant="secondary" size="sm">Browse catalogue</Button>}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {(lists.recommended || []).map((resource) => (
            <Link
              key={resource._id || resource.id}
              to={`/catalog/${resource._id || resource.id}`}
              className="group rounded-lg border border-line p-3 transition-colors hover:border-brand-300 hover:bg-brand-50/40"
            >
              <div className="mb-2 flex h-16 items-center justify-center rounded bg-slate-100 text-slate-300">
                {resource.coverImage
                  ? <img src={resource.coverImage} alt="" className="h-full w-full rounded object-cover" />
                  : <BookOpen className="h-6 w-6" aria-hidden="true" />}
              </div>
              <p className="line-clamp-2 text-xs font-medium text-slate-800 group-hover:text-brand-700">{resource.title}</p>
              <p className="mt-1 text-2xs text-slate-500">{humanize(resource.resourceType)}</p>
            </Link>
          ))}
          {!isLoading && !(lists.recommended || []).length && (
            <p className="col-span-full py-6 text-center text-sm text-slate-500">No recommendations yet.</p>
          )}
        </div>
      </Card>
    </>
  );
}
