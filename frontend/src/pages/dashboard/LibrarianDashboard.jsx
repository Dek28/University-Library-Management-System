import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { dashboardApi } from '../../api/endpoints';
import { Card, StatCard, PageHeader, ErrorState, Button, StatusBadge } from '../../components/ui';
import { CirculationLineChart } from '../../components/charts/Charts';
import { formatMoney, formatNumber, formatDate, fullName, memberIdentifier } from '../../utils/format';
import { useAuthStore } from '../../store/auth';
import useFinesEnabled from '../../hooks/useFinesEnabled';
import dayjs from 'dayjs';

export default function LibrarianDashboard() {
  const settings = useAuthStore((state) => state.settings);
  const symbol = settings?.locale?.currencySymbol || '$';
  const finesEnabled = useFinesEnabled();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['dashboard', 'librarian'],
    queryFn: dashboardApi.librarian,
    staleTime: 30_000,
  });

  if (error) return <ErrorState message={error.message} onRetry={refetch} />;

  const cards = data?.cards || {};
  const lists = data?.lists || {};

  return (
    <>
      <PageHeader
        title="Circulation Desk"
        breadcrumbs={[{ label: 'Dashboard' }]}
        actions={(
          <>
            <Button as={Link} to="/circulation/borrow">Issue an item</Button>
            <Button as={Link} to="/circulation/return" variant="secondary">Receive a return</Button>
          </>
        )}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Books issued today" value={formatNumber(cards.issuedToday)} tone="blue" loading={isLoading} to="/circulation/loans" />
        <StatCard label="Returns today" value={formatNumber(cards.returnedToday)} tone="green" loading={isLoading} to="/circulation/loans" />
        <StatCard label="Overdue books" value={formatNumber(cards.overdueLoans)} tone="red" loading={isLoading} to="/circulation/loans?overdueOnly=true" />
        <StatCard label="Ready for pickup" value={formatNumber(cards.reservationsReady)} tone="amber" loading={isLoading} to="/administration/reservations?status=ready" />
      </div>

      <div className={`mt-4 grid gap-4 sm:grid-cols-2 ${finesEnabled ? 'xl:grid-cols-4' : 'xl:grid-cols-3'}`}>
        <StatCard label="Pending clearance" value={formatNumber(cards.pendingClearance)} tone="purple" loading={isLoading} to="/clearance" />
        {finesEnabled && (
          <StatCard label="Outstanding fines" value={formatMoney(cards.outstandingFines, symbol)} tone="amber" loading={isLoading} to="/administration/fines?outstandingOnly=true" />
        )}
        <StatCard label="Reading sessions today" value={formatNumber(cards.readingSessionsToday)} tone="blue" loading={isLoading} to="/reading-groups/schedule" />
        <StatCard label="Recently added titles" value={formatNumber((lists.recentlyAdded || []).length)} tone="slate" loading={isLoading} to="/catalog" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card title="Monthly circulation" className="xl:col-span-2">
          {isLoading ? <div className="skeleton h-[260px]" /> : <CirculationLineChart data={data?.charts?.circulationTrend || []} />}
        </Card>

        <Card title="Reading sessions today" noPadding>
          <ul className="divide-y divide-line">
            {(lists.sessionsToday || []).map((session) => (
              <li key={session._id || session.id} className="px-5 py-3">
                <p className="truncate text-sm font-medium text-slate-800">{session.group?.name}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {session.startTime}–{session.endTime} · {session.space?.name}
                </p>
              </li>
            ))}
            {!isLoading && !(lists.sessionsToday || []).length && (
              <li className="px-5 py-8 text-center text-sm text-slate-500">No sessions scheduled for today.</li>
            )}
          </ul>
        </Card>
      </div>

      <Card
        className="mt-4"
        title="Overdue items needing follow-up"
        actions={<Button as={Link} to="/circulation/loans?overdueOnly=true" variant="secondary" size="sm">View all</Button>}
        noPadding
      >
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Identifier</th>
                <th>Title</th>
                <th>Due date</th>
                <th className="text-right">Days late</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(lists.overdueLoans || []).map((loan) => (
                <tr key={loan._id || loan.id}>
                  <td className="font-medium text-slate-800">{fullName(loan.user)}</td>
                  <td className="text-slate-500">{memberIdentifier(loan.user)}</td>
                  <td className="max-w-[280px] truncate">{loan.resource?.title}</td>
                  <td>{formatDate(loan.dueDate)}</td>
                  <td className="text-right font-medium text-red-600">
                    {Math.max(0, dayjs().startOf('day').diff(dayjs(loan.dueDate).startOf('day'), 'day'))}
                  </td>
                  <td className="text-right">
                    <Link to={`/circulation/loans/${loan._id || loan.id}`} className="text-sm font-medium text-brand-600 hover:underline">
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
              {!isLoading && !(lists.overdueLoans || []).length && (
                <tr><td colSpan={6} className="py-8 text-center text-sm text-slate-500">Nothing is overdue. </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
