import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Library } from 'lucide-react';
import { dashboardApi } from '../../api/endpoints';
import { Card, StatCard, PageHeader, ErrorState, StatusBadge } from '../../components/ui';
import { CirculationLineChart, CategoryDonut, RankingBarChart } from '../../components/charts/Charts';
import { formatMoney, formatNumber, humanize } from '../../utils/format';
import { useAuthStore } from '../../store/auth';
import useFinesEnabled from '../../hooks/useFinesEnabled';

export default function AdminDashboard() {
  const settings = useAuthStore((state) => state.settings);
  const symbol = settings?.locale?.currencySymbol || '$';
  const finesEnabled = useFinesEnabled();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['dashboard', 'admin'],
    queryFn: dashboardApi.admin,
    staleTime: 60_000,
  });

  if (error) return <ErrorState message={error.message} onRetry={refetch} />;

  const cards = data?.cards || {};
  const charts = data?.charts || {};
  const lists = data?.lists || {};

  const tiles = [
    { label: 'Total Books', value: formatNumber(cards.totalResources), tone: 'blue', to: '/catalog' },
    { label: 'Borrowed Books', value: formatNumber(cards.borrowedItems), tone: 'amber', to: '/circulation/loans?openOnly=true' },
    { label: 'Members', value: formatNumber(cards.totalMembers), tone: 'green', to: '/users' },
    { label: 'Overdue Books', value: formatNumber(cards.overdueItems), tone: 'red', to: '/circulation/loans?overdueOnly=true' },
  ];

  const secondaryTiles = [
    { label: 'Available copies', value: formatNumber(cards.availableCopies), tone: 'green' },
    { label: 'Lost items', value: formatNumber(cards.lostItems), tone: 'red', to: '/inventory/copies/lost' },
    { label: 'Damaged items', value: formatNumber(cards.damagedItems), tone: 'amber', to: '/inventory/copies/damaged' },
    { label: 'Outstanding fines', value: formatMoney(cards.outstandingFines, symbol), tone: 'amber', to: '/administration/fines?outstandingOnly=true', fines: true },
    { label: 'Fines collected', value: formatMoney(cards.finesCollected, symbol), tone: 'green', to: '/administration/fines', fines: true },
    { label: 'Pending clearance', value: formatNumber(cards.pendingClearance), tone: 'purple', to: '/clearance' },
    { label: 'Digital resources', value: formatNumber(cards.digitalResources), tone: 'blue', to: '/digital-library' },
    { label: 'Active reading groups', value: formatNumber(cards.activeReadingGroups), tone: 'blue', to: '/reading-groups' },
    { label: 'Reservations waiting', value: formatNumber(cards.reservationsPending), tone: 'amber', to: '/administration/reservations' },
    { label: 'Ready for pickup', value: formatNumber(cards.reservationsReady), tone: 'green', to: '/administration/reservations?status=ready' },
    { label: 'Academic staff', value: formatNumber(cards.academicStaff), tone: 'slate', to: '/users?roleKey=lecturer' },
    { label: 'Librarians', value: formatNumber(cards.librarians), tone: 'slate', to: '/users?roleKey=librarian' },
  ].filter((tile) => !tile.fines || finesEnabled);

  return (
    <>
      <PageHeader title="Dashboard" breadcrumbs={[{ label: 'Dashboard' }]} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((tile) => <StatCard key={tile.label} {...tile} loading={isLoading} />)}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card title="Monthly circulation" className="xl:col-span-2">
          {isLoading ? <div className="skeleton h-[260px]" /> : <CirculationLineChart data={charts.circulationTrend || []} />}
        </Card>

        <Card title="Loans by category">
          {isLoading ? <div className="skeleton h-[260px]" /> : <CategoryDonut data={charts.topCategories || []} />}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {secondaryTiles.map((tile) => <StatCard key={tile.label} {...tile} loading={isLoading} />)}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Loans by department">
          {isLoading ? <div className="skeleton h-[280px]" /> : <RankingBarChart data={charts.departmentUsage || []} />}
        </Card>

        <Card title="Copy status">
          {isLoading ? <div className="skeleton h-[280px]" /> : (
            <CategoryDonut
              data={(charts.copyStatusDistribution || []).map((entry) => ({ name: humanize(entry.status), count: entry.count }))}
            />
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Most borrowed titles" noPadding>
          <ul className="divide-y divide-line">
            {(lists.mostBorrowed || []).map((resource) => (
              <li key={resource._id || resource.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <Link to={`/catalog/${resource._id || resource.id}`} className="block truncate text-sm font-medium text-slate-800 hover:text-brand-600">
                    {resource.title}
                  </Link>
                  <p className="text-xs text-slate-500">{humanize(resource.resourceType)}</p>
                </div>
                <span className="shrink-0 rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700">
                  {resource.borrowCount} loans
                </span>
              </li>
            ))}
            {!isLoading && !(lists.mostBorrowed || []).length && (
              <li className="px-5 py-8 text-center text-sm text-slate-500">No loans recorded yet.</li>
            )}
          </ul>
        </Card>

        <Card title="Recently added to the catalogue" noPadding>
          <ul className="divide-y divide-line">
            {(lists.recentlyAdded || []).map((resource) => (
              <li key={resource._id || resource.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <Link to={`/catalog/${resource._id || resource.id}`} className="block truncate text-sm font-medium text-slate-800 hover:text-brand-600">
                    {resource.title}
                  </Link>
                  <p className="truncate text-xs text-slate-500">
                    {(resource.authors || []).map((a) => a.fullName).join(', ') || humanize(resource.resourceType)}
                  </p>
                </div>
                <StatusBadge status={resource.status} />
              </li>
            ))}
            {!isLoading && !(lists.recentlyAdded || []).length && (
              <li className="px-5 py-8 text-center text-sm text-slate-500">Nothing catalogued yet.</li>
            )}
          </ul>
        </Card>
      </div>
    </>
  );
}
