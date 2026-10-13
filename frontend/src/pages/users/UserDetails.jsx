import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  PageHeader, Card, Button, DetailRow, StatusBadge, Badge, Avatar, Tabs,
  DataTable, PageLoader, ErrorState, StatCard, Modal, Barcode,
} from '../../components/ui';
import { userApi, clearanceApi } from '../../api/endpoints';
import { useAuthStore } from '../../store/auth';
import useFinesEnabled from '../../hooks/useFinesEnabled';
import { P } from '../../constants';
import {
  formatDate, formatDateTime, formatMoney, fullName, memberIdentifier, humanize,
} from '../../utils/format';

export default function UserDetails() {
  const { id } = useParams();
  const can = useAuthStore((state) => state.can);
  const settings = useAuthStore((state) => state.settings);
  const symbol = settings?.locale?.currencySymbol || '$';
  const finesEnabled = useFinesEnabled();

  const [tab, setTab] = useState('loans');
  const [cardOpen, setCardOpen] = useState(false);

  const { data: user, isLoading, error, refetch } = useQuery({
    queryKey: ['user', id],
    queryFn: () => userApi.get(id),
  });

  const { data: activity } = useQuery({
    queryKey: ['user', id, 'activity'],
    queryFn: () => userApi.activity(id),
    enabled: Boolean(user),
  });

  if (isLoading) return <PageLoader label="Loading member…" />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;
  if (!user) return null;

  const runClearance = async () => {
    try {
      await clearanceApi.requestFor(id);
      toast.success('Clearance check recorded');
      refetch();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const loanColumns = [
    {
      key: 'transactionId',
      header: 'Transaction',
      primary: true,
      render: (row) => (
        <Link to={`/circulation/loans/${row._id || row.id}`} className="font-medium text-slate-800 hover:text-brand-600">
          {row.transactionId}
        </Link>
      ),
    },
    { key: 'resource', header: 'Title', render: (row) => row.resource?.title || '-' },
    { key: 'copy', header: 'Copy', hideOnMobile: true, render: (row) => row.copy?.accessionNumber || '-' },
    { key: 'borrowDate', header: 'Borrowed', render: (row) => formatDate(row.borrowDate) },
    { key: 'dueDate', header: 'Due', render: (row) => formatDate(row.dueDate) },
    { key: 'returnDate', header: 'Returned', hideOnMobile: true, render: (row) => formatDate(row.returnDate) },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
  ];

  const fineColumns = [
    { key: 'fineCode', header: 'Fine', primary: true },
    { key: 'fineType', header: 'Type', render: (row) => humanize(row.fineType) },
    { key: 'reason', header: 'Reason', hideOnMobile: true },
    { key: 'amount', header: 'Amount', align: 'right', render: (row) => formatMoney(row.amount, symbol) },
    {
      key: 'balance',
      header: 'Outstanding',
      align: 'right',
      render: (row) => formatMoney(row.amount - row.amountPaid - row.amountWaived, symbol),
    },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    { key: 'createdAt', header: 'Raised', hideOnMobile: true, render: (row) => formatDate(row.createdAt) },
  ];

  const reservationColumns = [
    { key: 'reservationCode', header: 'Reference', primary: true },
    { key: 'resource', header: 'Title', render: (row) => row.resource?.title || '-' },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    { key: 'reservedAt', header: 'Reserved', render: (row) => formatDate(row.reservedAt) },
    { key: 'expiresAt', header: 'Collect by', render: (row) => formatDate(row.expiresAt) },
  ];

  const stats = activity?.stats || {};

  return (
    <>
      <PageHeader
        title={fullName(user)}
        breadcrumbs={[{ label: 'Users', to: '/users' }, { label: fullName(user) }]}
        actions={(
          <>
            <Button as={Link} to="/users" variant="secondary">Back</Button>
            <Button variant="secondary" onClick={() => setCardOpen(true)}>Library card</Button>
            {can(P.CLEARANCE_PROCESS) && (
              <Button variant="secondary" onClick={runClearance}>Run clearance check</Button>
            )}
            {can(P.USER_UPDATE) && <Button as={Link} to={`/users/${id}/edit`}>Edit</Button>}
          </>
        )}
      />

      <div className={`mb-4 grid gap-4 sm:grid-cols-2 ${finesEnabled ? 'xl:grid-cols-4' : 'xl:grid-cols-3'}`}>
        <StatCard label="Active loans" value={stats.active ?? user.activeLoanCount ?? 0} tone="blue" />
        <StatCard label="Overdue" value={stats.overdue ?? 0} tone="red" />
        <StatCard label="Total loans" value={stats.total ?? 0} tone="slate" />
        {finesEnabled && (
          <StatCard label="Outstanding fines" value={formatMoney(stats.outstandingFineTotal ?? user.outstandingFineTotal, symbol)} tone="amber" />
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-1">
          <div className="flex flex-col items-center text-center">
            <Avatar user={user} size="xl" />
            <p className="mt-3 text-md font-semibold text-slate-900">{fullName(user)}</p>
            <p className="text-xs text-slate-500">{memberIdentifier(user)}</p>
            <div className="mt-2 flex flex-wrap justify-center gap-1.5">
              <StatusBadge status={user.status} />
              <Badge tone="blue">{user.role?.name}</Badge>
            </div>
          </div>

          <dl className="mt-5 divide-y divide-line border-t border-line pt-2">
            <DetailRow label="Email">{user.email}</DetailRow>
            <DetailRow label="Phone">{user.phone || '-'}</DetailRow>
            <DetailRow label="Gender">{humanize(user.gender)}</DetailRow>
            <DetailRow label="Faculty">{user.faculty?.name || '-'}</DetailRow>
            <DetailRow label="Department">{user.department?.name || '-'}</DetailRow>
            <DetailRow label="Program">{user.program?.name || '-'}</DetailRow>
            <DetailRow label="Academic year">{user.academicYear || '-'}</DetailRow>
            <DetailRow label="Year of study">{user.yearOfStudy || '-'}</DetailRow>
            <DetailRow label="Graduation year">{user.graduationYear || '-'}</DetailRow>
            <DetailRow label="Clearance"><StatusBadge status={user.clearanceStatus} /></DetailRow>
            <DetailRow label="Registered">{formatDate(user.createdAt)}</DetailRow>
            <DetailRow label="Last sign-in">{formatDateTime(user.lastLoginAt)}</DetailRow>
            {user.statusReason && <DetailRow label="Status reason">{user.statusReason}</DetailRow>}
            {user.notes && <DetailRow label="Notes">{user.notes}</DetailRow>}
          </dl>
        </Card>

        <Card className="xl:col-span-2" noPadding>
          <Tabs
            className="px-2"
            tabs={[
              { key: 'loans', label: 'Borrowing history', count: (activity?.loans || []).length },
              finesEnabled && { key: 'fines', label: 'Fines', count: (activity?.fines || []).length },
              { key: 'reservations', label: 'Reservations', count: (activity?.reservations || []).length },
            ].filter(Boolean)}
            value={tab}
            onChange={setTab}
          />

          {tab === 'loans' && (
            <DataTable
              columns={loanColumns}
              rows={activity?.loans || []}
              rowKey={(row) => row._id || row.id}
              emptyTitle="No borrowing history"
            />
          )}
          {tab === 'fines' && finesEnabled && (
            <DataTable
              columns={fineColumns}
              rows={activity?.fines || []}
              rowKey={(row) => row._id || row.id}
              emptyTitle="No fines on this account"
            />
          )}
          {tab === 'reservations' && (
            <DataTable
              columns={reservationColumns}
              rows={activity?.reservations || []}
              rowKey={(row) => row._id || row.id}
              emptyTitle="No active reservations"
            />
          )}
        </Card>
      </div>

      <Modal
        open={cardOpen}
        onClose={() => setCardOpen(false)}
        title="Library card"
        size="sm"
        footer={<Button onClick={() => window.print()}>Print</Button>}
      >
        <div className="rounded-lg border border-line p-5 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {settings?.institution?.libraryName || 'University Library'}
          </p>
          <p className="mt-2 text-md font-semibold text-slate-900">{fullName(user)}</p>
          <p className="text-xs text-slate-500">{memberIdentifier(user)}</p>
          <p className="text-xs text-slate-500">{user.role?.name}</p>
          <div className="mt-3 flex justify-center">
            <Barcode value={user.barcode} />
          </div>
        </div>
      </Modal>
    </>
  );
}
