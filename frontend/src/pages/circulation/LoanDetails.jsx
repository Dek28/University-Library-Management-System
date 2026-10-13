import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  PageHeader, Card, Button, DetailRow, StatusBadge, Badge, Avatar,
  PageLoader, ErrorState, ConfirmDialog, Modal, Textarea,
} from '../../components/ui';
import { loanApi } from '../../api/endpoints';
import { useAuthStore } from '../../store/auth';
import useFinesEnabled from '../../hooks/useFinesEnabled';
import { P } from '../../constants';
import {
  formatDate, formatDateTime, formatMoney, fullName, memberIdentifier, daysUntil, humanize,
} from '../../utils/format';

export default function LoanDetails() {
  const { id } = useParams();
  const can = useAuthStore((state) => state.can);
  const settings = useAuthStore((state) => state.settings);
  const symbol = settings?.locale?.currencySymbol || '$';
  const finesEnabled = useFinesEnabled();

  const [renewOpen, setRenewOpen] = useState(false);
  const [lostOpen, setLostOpen] = useState(false);
  const [lostReason, setLostReason] = useState('');
  const [busy, setBusy] = useState(false);

  const { data: loan, isLoading, error, refetch } = useQuery({
    queryKey: ['loan', id],
    queryFn: () => loanApi.get(id),
  });

  if (isLoading) return <PageLoader label="Loading loan…" />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;
  if (!loan) return null;

  const isOpen = ['active', 'overdue'].includes(loan.status);
  const remaining = daysUntil(loan.dueDate);

  const renew = async () => {
    setBusy(true);
    try {
      const updated = await loanApi.renew(id);
      toast.success(`Renewed. New due date: ${formatDate(updated.dueDate)}`);
      setRenewOpen(false);
      refetch();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const markLost = async () => {
    setBusy(true);
    try {
      await loanApi.markLost(id, { reason: lostReason });
      toast.success('Loan written off as lost');
      setLostOpen(false);
      refetch();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title={`Loan ${loan.transactionId}`}
        breadcrumbs={[
          { label: 'Circulation', to: '/circulation' },
          { label: 'Loans', to: '/circulation/loans' },
          { label: loan.transactionId },
        ]}
        actions={(
          <>
            <Button as={Link} to="/circulation/loans" variant="secondary">Back</Button>
            <Button
              variant="secondary"
              onClick={() => loanApi.receipt(id).catch((e) => toast.error(e.message))}
            >
              Receipt
            </Button>
            {isOpen && can(P.LOAN_RENEW) && loan.renewalCount < loan.maxRenewals && (
              <Button onClick={() => setRenewOpen(true)}>Renew</Button>
            )}
            {isOpen && can(P.LOAN_MARK_LOST) && (
              <Button variant="danger" onClick={() => setLostOpen(true)}>Mark lost</Button>
            )}
          </>
        )}
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <Card title="Loan" className="xl:col-span-2">
          <dl className="divide-y divide-line">
            <DetailRow label="Transaction ID">{loan.transactionId}</DetailRow>
            <DetailRow label="Title">
              <Link to={`/catalog/${loan.resource?.id}`} className="text-brand-600 hover:underline">
                {loan.resource?.title}
              </Link>
            </DetailRow>
            <DetailRow label="Copy">{loan.copy?.accessionNumber} · {loan.copy?.barcode}</DetailRow>
            <DetailRow label="Status"><StatusBadge status={loan.status} /></DetailRow>
            <DetailRow label="Borrowed on">{formatDateTime(loan.borrowDate)}</DetailRow>
            <DetailRow label="Due date">
              <span className="flex flex-wrap items-center gap-2">
                {formatDate(loan.dueDate)}
                {isOpen && (remaining < 0
                  ? <Badge tone="red">{Math.abs(remaining)} day(s) overdue</Badge>
                  : <Badge tone="green">{remaining} day(s) remaining</Badge>)}
              </span>
            </DetailRow>
            <DetailRow label="Returned on">{loan.returnDate ? formatDateTime(loan.returnDate) : '-'}</DetailRow>
            <DetailRow label="Renewals">{loan.renewalCount} of {loan.maxRenewals}</DetailRow>
            <DetailRow label="Condition on issue">{humanize(loan.conditionOnIssue)}</DetailRow>
            <DetailRow label="Condition on return">{loan.conditionOnReturn ? humanize(loan.conditionOnReturn) : '-'}</DetailRow>
            <DetailRow label="Issued by">{fullName(loan.issuedBy)}</DetailRow>
            <DetailRow label="Received by">{loan.returnedTo ? fullName(loan.returnedTo) : '-'}</DetailRow>
            {finesEnabled && <DetailRow label="Total fines">{formatMoney(loan.fineAmount, symbol)}</DetailRow>}
            {loan.notes && <DetailRow label="Notes">{loan.notes}</DetailRow>}
            {loan.returnNotes && <DetailRow label="Return notes">{loan.returnNotes}</DetailRow>}
          </dl>
        </Card>

        <div className="space-y-4">
          <Card title="Borrower">
            <div className="flex items-start gap-3">
              <Avatar user={loan.user} size="lg" />
              <div className="min-w-0">
                <p className="text-base font-semibold text-slate-900">{fullName(loan.user)}</p>
                <p className="text-xs text-slate-500">{memberIdentifier(loan.user)}</p>
                <p className="truncate text-xs text-slate-500">{loan.user?.email}</p>
                {can(P.USER_VIEW) && (
                  <Link to={`/users/${loan.user?.id}`} className="mt-2 inline-block text-xs font-medium text-brand-600 hover:underline">
                    Open member record
                  </Link>
                )}
              </div>
            </div>
          </Card>

          {finesEnabled && (
          <Card title="Fines raised" noPadding>
            <ul className="divide-y divide-line">
              {(loan.fines || []).map((fine) => (
                <li key={fine._id || fine.id} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <Link to={`/administration/fines/${fine._id || fine.id}`} className="text-sm font-medium text-slate-800 hover:text-brand-600">
                        {fine.fineCode}
                      </Link>
                      <p className="truncate text-xs text-slate-500">{fine.reason}</p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold text-slate-900">{formatMoney(fine.amount, symbol)}</span>
                  </div>
                  <div className="mt-1.5"><StatusBadge status={fine.status} /></div>
                </li>
              ))}
              {!(loan.fines || []).length && (
                <li className="px-5 py-6 text-center text-sm text-slate-500">No fines on this loan.</li>
              )}
            </ul>
          </Card>
          )}

          <Card title="Renewal history" noPadding>
            <ul className="divide-y divide-line">
              {(loan.renewals || []).map((renewal) => (
                <li key={renewal._id || renewal.id} className="px-5 py-3">
                  <p className="text-sm font-medium text-slate-800">Renewal #{renewal.renewalNumber}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {formatDate(renewal.previousDueDate)} → {formatDate(renewal.newDueDate)}
                  </p>
                  <p className="text-2xs text-slate-400">
                    {renewal.channel === 'self_service' ? 'Self-service' : 'At the desk'} · {fullName(renewal.renewedBy)}
                  </p>
                </li>
              ))}
              {!(loan.renewals || []).length && (
                <li className="px-5 py-6 text-center text-sm text-slate-500">Never renewed.</li>
              )}
            </ul>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={renewOpen}
        onClose={() => setRenewOpen(false)}
        onConfirm={renew}
        loading={busy}
        tone="primary"
        title="Renew this loan?"
        confirmLabel="Renew"
        message="The due date will be extended by the borrower's standard renewal period. Renewal is refused if another member is waiting for this title."
      />

      <Modal
        open={lostOpen}
        onClose={() => setLostOpen(false)}
        title="Write this loan off as lost"
        size="sm"
        footer={(
          <>
            <Button variant="secondary" onClick={() => setLostOpen(false)}>Cancel</Button>
            <Button variant="danger" onClick={markLost} loading={busy} disabled={lostReason.trim().length < 3}>Mark as lost</Button>
          </>
        )}
      >
        <Textarea
          label="Reason"
          required
          rows={3}
          value={lostReason}
          onChange={(e) => setLostReason(e.target.value)}
          placeholder="Why is this item being written off?"
        />
      </Modal>
    </>
  );
}
