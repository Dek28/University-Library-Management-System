import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, XCircle } from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { useState } from 'react';
import {
  PageHeader, Card, Button, DetailRow, StatusBadge, Badge, PageLoader, ErrorState,
} from '../../components/ui';
import { clearanceApi } from '../../api/endpoints';
import { useAuthStore } from '../../store/auth';
import useFinesEnabled from '../../hooks/useFinesEnabled';
import { P } from '../../constants';
import { formatMoney, formatDate, fullName } from '../../utils/format';

export default function MyClearance() {
  const can = useAuthStore((state) => state.can);
  const settings = useAuthStore((state) => state.settings);
  const symbol = settings?.locale?.currencySymbol || '$';
  const finesEnabled = useFinesEnabled();
  const [busy, setBusy] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['clearance', 'my-status'],
    queryFn: clearanceApi.myStatus,
  });

  if (isLoading) return <PageLoader label="Loading clearance status…" />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;

  const clearance = data?.clearance;
  const obligations = data?.obligations || {};

  const request = async () => {
    setBusy(true);
    try {
      await clearanceApi.requestOwn();
      toast.success('Clearance request submitted');
      refetch();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const items = [
    { label: 'Books returned', ok: obligations.activeLoans === 0, detail: `${obligations.activeLoans || 0} still on loan` },
    { label: 'No overdue items', ok: obligations.overdueLoans === 0, detail: `${obligations.overdueLoans || 0} overdue` },
    { label: 'No lost items', ok: obligations.lostItems === 0, detail: `${obligations.lostItems || 0} recorded lost` },
    finesEnabled && { label: 'Outstanding fines', ok: (obligations.outstandingFineTotal || 0) === 0, detail: formatMoney(obligations.outstandingFineTotal, symbol) },
  ].filter(Boolean);

  return (
    <>
      <PageHeader
        title="My Clearance"
        breadcrumbs={[{ label: 'My library' }, { label: 'Clearance' }]}
        actions={(
          <>
            {clearance?.status === 'cleared' && (
              <Button
                onClick={() => clearanceApi.certificate(clearance.id, clearance.clearanceCode).catch((e) => toast.error(e.message))}
              >
                Download certificate
              </Button>
            )}
            {can(P.CLEARANCE_REQUEST_OWN) && clearance?.status !== 'cleared' && (
              <Button onClick={request} loading={busy}>
                {clearance ? 'Re-check my status' : 'Request clearance'}
              </Button>
            )}
          </>
        )}
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2" title="Your obligations">
          <ul className="divide-y divide-line">
            {items.map((item) => (
              <li key={item.label} className="flex items-center justify-between gap-3 py-3">
                <div className="flex items-center gap-2.5">
                  {item.ok
                    ? <CheckCircle2 className="h-4.5 w-4.5 text-emerald-600" aria-hidden="true" />
                    : <XCircle className="h-4.5 w-4.5 text-red-500" aria-hidden="true" />}
                  <span className="text-sm text-slate-700">{item.label}</span>
                </div>
                <div className="text-right">
                  <p className={clsx('text-sm font-semibold', item.ok ? 'text-emerald-600' : 'text-red-600')}>
                    {item.ok ? 'Cleared' : 'Outstanding'}
                  </p>
                  <p className="text-2xs text-slate-500">{item.detail}</p>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 px-4 py-3.5">
            <div>
              <p className="text-xs text-slate-500">Overall</p>
              <p className={clsx('text-lg font-bold', data?.isClear ? 'text-emerald-600' : 'text-red-600')}>
                {data?.isClear ? 'CLEARED' : 'NOT CLEARED'}
              </p>
            </div>
            {!data?.isClear && (
              <p className="max-w-sm text-xs text-slate-500">
                {(data?.blockingReasons || []).join('; ')}
              </p>
            )}
          </div>
        </Card>

        <Card title="Clearance record">
          {clearance ? (
            <dl className="divide-y divide-line">
              <DetailRow label="Reference">{clearance.clearanceCode}</DetailRow>
              <DetailRow label="Status"><StatusBadge status={clearance.status} /></DetailRow>
              <DetailRow label="Requested">{formatDate(clearance.requestedAt)}</DetailRow>
              <DetailRow label="Verified by">{clearance.verifiedBy ? fullName(clearance.verifiedBy) : '-'}</DetailRow>
              <DetailRow label="Verified on">{formatDate(clearance.verifiedAt)}</DetailRow>
              {clearance.certificateNumber && <DetailRow label="Certificate">{clearance.certificateNumber}</DetailRow>}
              {clearance.isOverride && (
                <DetailRow label="Note"><Badge tone="amber">Granted by authorised override</Badge></DetailRow>
              )}
              {clearance.comments && <DetailRow label="Comments">{clearance.comments}</DetailRow>}
            </dl>
          ) : (
            <p className="py-6 text-center text-sm text-slate-500">
              You have not requested library clearance yet.
            </p>
          )}
        </Card>
      </div>
    </>
  );
}
