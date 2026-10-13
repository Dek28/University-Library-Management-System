import { useState } from 'react';
import { Link } from 'react-router';
import { XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  PageHeader, Card, DataTable, Pagination, Button, IconButton, SearchInput,
  Select, StatusBadge, Modal, Textarea, Badge,
} from '../../components/ui';
import { reservationApi } from '../../api/endpoints';
import useListQuery from '../../hooks/useListQuery';
import { useAuthStore } from '../../store/auth';
import { P } from '../../constants';
import { formatDate, fullName, memberIdentifier, daysUntil } from '../../utils/format';

export default function Reservations({ ownOnly = false }) {
  const can = useAuthStore((state) => state.can);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const list = useListQuery({
    queryKey: ['reservations', ownOnly],
    queryFn: reservationApi.list,
    initialFilters: { status: '' },
  });

  const cancel = async () => {
    setBusy(true);
    try {
      await reservationApi.cancel(cancelTarget.id, { reason });
      toast.success('Reservation cancelled');
      setCancelTarget(null);
      setReason('');
      list.refetch();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  const expireStale = async () => {
    setBusy(true);
    try {
      const result = await reservationApi.expireStale();
      toast.success(`${result.expired} expired, ${result.reallocated} passed to the next member`);
      list.refetch();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  const columns = [
    { key: 'reservationCode', header: 'Reference', primary: true, render: (row) => <span className="font-medium text-slate-800">{row.reservationCode}</span> },
    ...(ownOnly ? [] : [{
      key: 'user',
      header: 'Member',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-800">{fullName(row.user)}</p>
          <p className="truncate text-xs text-slate-500">{memberIdentifier(row.user)}</p>
        </div>
      ),
    }]),
    {
      key: 'resource',
      header: 'Title',
      render: (row) => (
        <Link to={`/catalog/${row.resource?.id}`} className="text-slate-800 hover:text-brand-600">
          {row.resource?.title || '-'}
        </Link>
      ),
    },
    {
      key: 'queuePosition',
      header: 'Queue',
      align: 'center',
      render: (row) => (row.status === 'pending' && row.queuePosition
        ? <Badge tone="slate">#{row.queuePosition}</Badge>
        : '-'),
    },
    { key: 'reservedAt', header: 'Reserved', hideOnMobile: true, render: (row) => formatDate(row.reservedAt) },
    {
      key: 'expiresAt',
      header: 'Collect by',
      render: (row) => {
        if (row.status !== 'ready' || !row.expiresAt) return '-';
        const remaining = daysUntil(row.expiresAt);
        return (
          <div className="whitespace-nowrap">
            <p>{formatDate(row.expiresAt)}</p>
            <p className={remaining <= 1 ? 'text-2xs font-medium text-red-600' : 'text-2xs text-slate-500'}>
              {remaining < 0 ? 'expired' : remaining === 0 ? 'today' : `${remaining} day(s) left`}
            </p>
          </div>
        );
      },
    },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (['pending', 'ready'].includes(row.status) ? (
        <IconButton icon={XCircle} label="Cancel reservation" tone="danger" onClick={() => setCancelTarget(row)} />
      ) : null),
    },
  ];

  return (
    <>
      <PageHeader
        title={ownOnly ? 'My Reservations' : 'Reservations'}
        breadcrumbs={ownOnly
          ? [{ label: 'My library' }, { label: 'Reservations' }]
          : [{ label: 'Circulation' }, { label: 'Reservations' }]}
        actions={!ownOnly && can(P.RESERVATION_MANAGE) && (
          <Button variant="secondary" loading={busy} onClick={expireStale}>
            Expire uncollected holds
          </Button>
        )}
      />

      <Card noPadding>
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3.5">
          <SearchInput
            value={list.search}
            onChange={(e) => list.onSearchChange(e.target.value)}
            placeholder="Search reservations…"
            wrapperClassName="min-w-[220px] flex-1"
            aria-label="Search reservations"
          />
          <Select
            placeholder="All statuses"
            options={[
              { value: 'pending', label: 'Waiting in queue' },
              { value: 'ready', label: 'Ready for pickup' },
              { value: 'completed', label: 'Collected' },
              { value: 'cancelled', label: 'Cancelled' },
              { value: 'expired', label: 'Expired' },
            ]}
            value={list.filters.status || ''}
            onChange={(e) => list.setFilter('status', e.target.value)}
            wrapperClassName="w-48"
            aria-label="Filter by status"
          />
        </div>

        <DataTable
          columns={columns}
          rows={list.items}
          loading={list.isLoading}
          error={list.error}
          onRetry={list.refetch}
          emptyTitle={ownOnly ? 'You have no reservations' : 'No reservations'}
          emptyDescription={ownOnly
            ? 'Reserve a title from the catalogue when every copy is on loan.'
            : 'Holds placed by members will appear here.'}
          emptyAction={ownOnly ? <Button as={Link} to="/catalog" size="sm">Browse the catalogue</Button> : undefined}
        />

        <div className="border-t border-line">
          <Pagination
            page={list.meta.page}
            limit={list.meta.limit}
            total={list.meta.total}
            onPageChange={list.setPage}
            onLimitChange={list.onLimitChange}
          />
        </div>
      </Card>

      <Modal
        open={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        title="Cancel this reservation?"
        description={cancelTarget?.resource?.title}
        size="sm"
        footer={(
          <>
            <Button variant="secondary" onClick={() => setCancelTarget(null)}>Keep reservation</Button>
            <Button variant="danger" onClick={cancel} loading={busy}>Cancel reservation</Button>
          </>
        )}
      >
        <p className="mb-3 text-sm text-slate-600">
          If a copy is already being held for this reservation, it is released to the next member in
          the queue straight away.
        </p>
        <Textarea label="Reason (optional)" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Modal>
    </>
  );
}
