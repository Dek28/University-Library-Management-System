import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  PageHeader, Card, Button, DetailRow, StatusBadge, Avatar,
  PageLoader, ErrorState, DataTable,
} from '../../components/ui';
import { fineApi } from '../../api/endpoints';
import { useAuthStore } from '../../store/auth';
import {
  formatMoney,
  formatDateTime,
  fullName,
  memberIdentifier,
  humanize,
} from '../../utils/format';

export default function FineDetails() {
  const { id } = useParams();
  const settings = useAuthStore((state) => state.settings);
  const symbol = settings?.locale?.currencySymbol || '$';

  const { data: fine, isLoading, error, refetch } = useQuery({
    queryKey: ['fine', id],
    queryFn: () => fineApi.get(id),
  });

  if (isLoading) return <PageLoader label="Loading fine…" />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;
  if (!fine) return null;

  const paymentColumns = [
    { key: 'receiptNumber', header: 'Receipt', primary: true },
    { key: 'kind', header: 'Type', render: (row) => humanize(row.kind) },
    { key: 'method', header: 'Method', render: (row) => humanize(row.method) },
    { key: 'amount', header: 'Amount', align: 'right', render: (row) => formatMoney(row.amount, symbol) },
    { key: 'processedBy', header: 'Processed by', render: (row) => fullName(row.processedBy) },
    { key: 'paidAt', header: 'Date', render: (row) => formatDateTime(row.paidAt) },
    { key: 'notes', hideWhenEmpty: true, header: 'Notes', hideOnMobile: true, render: (row) => row.notes || '-' },
  ];

  return (
    <>
      <PageHeader
        title={`Fine ${fine.fineCode}`}
        breadcrumbs={[
          { label: 'Circulation' },
          { label: 'Fines', to: '/administration/fines' },
          { label: fine.fineCode },
        ]}
        actions={(
          <>
            <Button as={Link} to="/administration/fines" variant="secondary">Back</Button>
            <Button
              onClick={() => fineApi.receipt(id).catch((e) => toast.error(e.message))}
            >
              Print statement
            </Button>
          </>
        )}
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <Card title="Fine" className="xl:col-span-2">
          <dl className="divide-y divide-line">
            <DetailRow label="Reference">{fine.fineCode}</DetailRow>
            <DetailRow label="Type">{humanize(fine.fineType)}</DetailRow>
            <DetailRow label="Reason">{fine.reason || '-'}</DetailRow>
            <DetailRow label="Related title">
              {fine.resource
                ? <Link to={`/catalog/${fine.resource.id}`} className="text-brand-600 hover:underline">{fine.resource.title}</Link>
                : '-'}
            </DetailRow>
            <DetailRow label="Related loan">
              {fine.loan
                ? <Link to={`/circulation/loans/${fine.loan.id}`} className="text-brand-600 hover:underline">{fine.loan.transactionId}</Link>
                : '-'}
            </DetailRow>
            <DetailRow label="Days overdue">{fine.daysOverdue || 0}</DetailRow>
            <DetailRow label="Status"><StatusBadge status={fine.status} /></DetailRow>
            <DetailRow label="Raised on">{formatDateTime(fine.createdAt)}</DetailRow>
            <DetailRow label="Settled on">{fine.settledAt ? formatDateTime(fine.settledAt) : '-'}</DetailRow>
            {fine.waiveReason && <DetailRow label="Waiver reason">{fine.waiveReason}</DetailRow>}
          </dl>
        </Card>

        <div className="space-y-4">
          <Card title="Balance">
            <dl className="divide-y divide-line">
              <DetailRow label="Amount charged">{formatMoney(fine.amount, symbol)}</DetailRow>
              <DetailRow label="Amount paid">{formatMoney(fine.amountPaid, symbol)}</DetailRow>
              <DetailRow label="Amount waived">{formatMoney(fine.amountWaived, symbol)}</DetailRow>
            </dl>
            <div className="mt-3 flex items-center justify-between rounded-md bg-slate-50 px-3.5 py-3">
              <span className="text-sm font-medium text-slate-600">Outstanding</span>
              <span className={`text-md font-semibold ${fine.balance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                {formatMoney(fine.balance, symbol)}
              </span>
            </div>
          </Card>

          <Card title="Member">
            <div className="flex items-start gap-3">
              <Avatar user={fine.user} size="lg" />
              <div className="min-w-0">
                <p className="text-base font-semibold text-slate-900">{fullName(fine.user)}</p>
                <p className="text-xs text-slate-500">{memberIdentifier(fine.user)}</p>
                <p className="truncate text-xs text-slate-500">{fine.user?.email}</p>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <Card className="mt-4" title="Payment history" noPadding>
        <DataTable
          columns={paymentColumns}
          rows={fine.payments || []}
          rowKey={(row) => row._id || row.id}
          emptyTitle="No payments yet"
          emptyDescription="Payments and waivers recorded against this fine will appear here."
        />
      </Card>
    </>
  );
}
