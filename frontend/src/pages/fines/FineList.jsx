import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Eye, DollarSign, Ban, Receipt } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  PageHeader, Card, StatCard, DataTable, Pagination, Button, IconButton,
  SearchInput, Select, StatusBadge, Modal, Input, Textarea,
} from '../../components/ui';
import { fineApi } from '../../api/endpoints';
import useListQuery from '../../hooks/useListQuery';
import { useAuthStore } from '../../store/auth';
import { P, FINE_TYPES, PAYMENT_METHODS } from '../../constants';
import { formatMoney, formatDate, fullName, memberIdentifier, humanize } from '../../utils/format';

/** Records a payment against a fine. */
function PaymentDialog({ fine, open, onClose, onSaved, symbol }) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);

  const balance = fine ? Number(fine.balance ?? fine.amount - fine.amountPaid - fine.amountWaived) : 0;

  const submit = async () => {
    setBusy(true);
    try {
      const result = await fineApi.pay(fine.id, { amount: Number(amount), method, reference });
      toast.success(`Payment recorded. Receipt ${result.payment.receiptNumber}`);
      onSaved();
      onClose();
      setAmount(''); setReference('');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Record a payment"
      description={fine ? `${fine.fineCode} · balance ${formatMoney(balance, symbol)}` : ''}
      size="sm"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={busy} disabled={!amount || Number(amount) <= 0}>Record payment</Button>
        </>
      )}
    >
      <div className="space-y-4">
        <Input
          label="Amount"
          type="number"
          step="0.01"
          min="0.01"
          max={balance}
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          hint={`Cannot exceed the outstanding balance of ${formatMoney(balance, symbol)}.`}
        />
        <Select label="Method" options={PAYMENT_METHODS} value={method} onChange={(e) => setMethod(e.target.value)} />
        <Input label="Reference (optional)" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Receipt or transaction number" />
        <Button variant="link" size="sm" onClick={() => setAmount(String(balance))}>Pay the full balance</Button>
      </div>
    </Modal>
  );
}

/** Waives all or part of a fine; a written reason is mandatory. */
function WaiveDialog({ fine, open, onClose, onSaved, symbol }) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const balance = fine ? Number(fine.balance ?? fine.amount - fine.amountPaid - fine.amountWaived) : 0;

  const submit = async () => {
    setBusy(true);
    try {
      await fineApi.waive(fine.id, { amount: amount ? Number(amount) : undefined, reason });
      toast.success('Fine waived');
      onSaved();
      onClose();
      setAmount(''); setReason('');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Waive this fine"
      description={fine ? `${fine.fineCode} · balance ${formatMoney(balance, symbol)}` : ''}
      size="sm"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="danger" onClick={submit} loading={busy} disabled={reason.trim().length < 5}>Waive fine</Button>
        </>
      )}
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Waiving is recorded against your account in the audit trail, together with the reason you give here.
        </p>
        <Input
          label="Amount to waive"
          type="number"
          step="0.01"
          min="0"
          max={balance}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          hint={`Leave blank to waive the whole balance of ${formatMoney(balance, symbol)}.`}
        />
        <Textarea
          label="Reason"
          required
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="At least 5 characters, e.g. Approved by the head librarian following an appeal"
        />
      </div>
    </Modal>
  );
}

export default function FineList({ ownOnly = false }) {
  const can = useAuthStore((state) => state.can);
  const settings = useAuthStore((state) => state.settings);
  const symbol = settings?.locale?.currencySymbol || '$';

  const [showFilters, setShowFilters] = useState(false);
  const [payTarget, setPayTarget] = useState(null);
  const [waiveTarget, setWaiveTarget] = useState(null);

  const list = useListQuery({
    queryKey: ['fines', ownOnly],
    queryFn: fineApi.list,
    initialFilters: { status: '', fineType: '' },
  });

  const { data: summary } = useQuery({
    queryKey: ['fines', 'summary'],
    queryFn: () => fineApi.summary(),
    enabled: !ownOnly && can(P.FINE_VIEW),
    staleTime: 60_000,
  });

  const exportAs = async (format) => {
    try {
      await fineApi.export(list.params, format);
      toast.success(`Exported as ${format.toUpperCase()}`);
    } catch (error) {
      toast.error(error.message);
    }
  };

  const columns = [
    {
      key: 'fineCode',
      header: 'Fine',
      primary: true,
      render: (row) => (
        <Link to={`/administration/fines/${row.id}`} className="font-medium text-slate-800 hover:text-brand-600">
          {row.fineCode}
        </Link>
      ),
    },
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
    { key: 'fineType', header: 'Type', render: (row) => humanize(row.fineType) },
    { key: 'resource', header: 'Title', hideOnMobile: true, render: (row) => row.resource?.title || '-' },
    { key: 'amount', header: 'Total fine', align: 'right', render: (row) => formatMoney(row.amount, symbol) },
    {
      key: 'balance',
      header: 'Outstanding',
      align: 'right',
      render: (row) => {
        const balance = Number(row.balance ?? row.amount - row.amountPaid - row.amountWaived);
        return balance > 0
          ? <span className="font-semibold text-red-600">{formatMoney(balance, symbol)}</span>
          : <span className="text-emerald-600">{formatMoney(0, symbol)}</span>;
      },
    },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    { key: 'createdAt', header: 'Raised', sortable: true, hideOnMobile: true, render: (row) => formatDate(row.createdAt) },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => {
        const balance = Number(row.balance ?? row.amount - row.amountPaid - row.amountWaived);
        const settled = ['paid', 'waived', 'cancelled'].includes(row.status);
        return (
          <div className="flex justify-end gap-0.5">
            <IconButton icon={Eye} label="View fine" onClick={() => { window.location.href = `/administration/fines/${row.id}`; }} />
            {!settled && can(P.FINE_PAY) && (
              <IconButton icon={DollarSign} label="Record payment" tone="success" onClick={() => setPayTarget(row)} />
            )}
            {!settled && can(P.FINE_WAIVE) && balance > 0 && (
              <IconButton icon={Ban} label="Waive fine" tone="danger" onClick={() => setWaiveTarget(row)} />
            )}
          </div>
        );
      },
    },
  ];

  return (
    <>
      <PageHeader
        title={ownOnly ? 'My Fines' : 'Fines Management'}
        breadcrumbs={ownOnly ? [{ label: 'My library' }, { label: 'Fines' }] : [{ label: 'Circulation' }, { label: 'Fines' }]}
        actions={!ownOnly && can(P.FINE_VIEW) && (
          <>
            <Button variant="secondary" onClick={() => exportAs('pdf')}>PDF</Button>
            <Button variant="secondary" onClick={() => exportAs('xlsx')}>Excel</Button>
          </>
        )}
      />

      {!ownOnly && summary && (
        <div className="mb-4 grid gap-4 sm:grid-cols-3">
          <StatCard label="Total Outstanding" value={formatMoney(summary.totalOutstanding, symbol)} tone="amber" hint={`${summary.outstandingCount} unsettled fine(s)`} />
          <StatCard label="Total Collected" value={formatMoney(summary.totalPaid, symbol)} tone="green" />
          <StatCard label="Total Waived" value={formatMoney(summary.totalWaived, symbol)} tone="blue" />
        </div>
      )}

      <Card noPadding>
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3.5">
          <SearchInput
            value={list.search}
            onChange={(e) => list.onSearchChange(e.target.value)}
            placeholder="Search member by name or ID…"
            wrapperClassName="min-w-[220px] flex-1"
            aria-label="Search fines"
          />
          <Button variant="secondary" onClick={() => setShowFilters((v) => !v)}>
            Filters{list.activeFilterCount > 0 && ` (${list.activeFilterCount})`}
          </Button>
        </div>

        {showFilters && (
          <div className="grid gap-3 border-b border-line bg-slate-50/60 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
            <Select
              label="Status"
              placeholder="All statuses"
              options={[
                { value: 'outstanding', label: 'Outstanding' },
                { value: 'partially_paid', label: 'Partially paid' },
                { value: 'paid', label: 'Paid' },
                { value: 'waived', label: 'Waived' },
                { value: 'cancelled', label: 'Cancelled' },
              ]}
              value={list.filters.status || ''}
              onChange={(e) => list.setFilter('status', e.target.value)}
            />
            <Select
              label="Fine type"
              placeholder="All types"
              options={FINE_TYPES}
              value={list.filters.fineType || ''}
              onChange={(e) => list.setFilter('fineType', e.target.value)}
            />
            <Input label="Raised from" type="date" value={list.filters.from || ''} onChange={(e) => list.setFilter('from', e.target.value)} />
            <Input label="Raised to" type="date" value={list.filters.to || ''} onChange={(e) => list.setFilter('to', e.target.value)} />
          </div>
        )}

        <DataTable
          columns={columns}
          rows={list.items}
          loading={list.isLoading}
          error={list.error}
          onRetry={list.refetch}
          sort={list.sort}
          onSortChange={list.setSort}
          emptyTitle={ownOnly ? 'You have no fines' : 'No fines found'}
          emptyDescription={ownOnly ? 'Return items on time to keep it that way.' : 'Try a different filter.'}
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

      <PaymentDialog
        fine={payTarget}
        open={Boolean(payTarget)}
        onClose={() => setPayTarget(null)}
        onSaved={list.refetch}
        symbol={symbol}
      />
      <WaiveDialog
        fine={waiveTarget}
        open={Boolean(waiveTarget)}
        onClose={() => setWaiveTarget(null)}
        onSaved={list.refetch}
        symbol={symbol}
      />
    </>
  );
}
