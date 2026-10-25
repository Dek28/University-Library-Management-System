import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Eye, RefreshCw, PackageX, Printer } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  PageHeader,
  Card,
  DataTable,
  Pagination,
  Button,
  IconButton,
  SearchInput,
  Select,
  StatusBadge,
  Tabs,
  ConfirmDialog,
  Modal,
  Textarea,
} from '../../components/ui';
import { loanApi } from '../../api/endpoints';
import useListQuery from '../../hooks/useListQuery';
import { useAuthStore } from '../../store/auth';
import useFinesEnabled from '../../hooks/useFinesEnabled';
import { P } from '../../constants';
import { formatDate, formatMoney, fullName, memberIdentifier, daysUntil, truncate } from '../../utils/format';

const TABS = [
  { key: 'all', label: 'All loans' },
  { key: 'open', label: 'Active' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'returned', label: 'Returned' },
];

/** Loans list, shared by the "active", "overdue" and "history" screens. */
export default function LoanList({ ownOnly = false, title = 'Circulation', defaultTab = 'all' }) {
  const [params] = useSearchParams();
  const can = useAuthStore((state) => state.can);
  const settings = useAuthStore((state) => state.settings);
  const symbol = settings?.locale?.currencySymbol || '$';
  const finesEnabled = useFinesEnabled();

  const initialTab = params.get('overdueOnly') === 'true' ? 'overdue'
    : params.get('openOnly') === 'true' ? 'open' : defaultTab;

  const [tab, setTab] = useState(initialTab);
  const [renewTarget, setRenewTarget] = useState(null);
  const [lostTarget, setLostTarget] = useState(null);
  const [lostReason, setLostReason] = useState('');
  const [busy, setBusy] = useState(false);

  const tabFilters = {
    all: {},
    open: { openOnly: true },
    overdue: { overdueOnly: true },
    returned: { status: 'returned' },
  };

  const list = useListQuery({
    queryKey: ['loans', tab, ownOnly],
    queryFn: loanApi.list,
    initialFilters: tabFilters[initialTab],
  });

  const switchTab = (key) => {
    setTab(key);
    list.replaceFilters(tabFilters[key]);
  };

  const renew = async () => {
    setBusy(true);
    try {
      const updated = await loanApi.renew(renewTarget.id);
      toast.success(`Renewed. New due date: ${formatDate(updated.dueDate)}`);
      setRenewTarget(null);
      list.refetch();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  const markLost = async () => {
    setBusy(true);
    try {
      await loanApi.markLost(lostTarget.id, { reason: lostReason });
      toast.success(finesEnabled ? 'Loan written off as lost and charges raised' : 'Loan written off as lost');
      setLostTarget(null);
      setLostReason('');
      list.refetch();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  const exportAs = async (format) => {
    try {
      await loanApi.export(list.params, format);
      toast.success(`Exported as ${format.toUpperCase()}`);
    } catch (error) {
      toast.error(error.message);
    }
  };

  const columns = [
    {
      key: 'transactionId',
      header: 'Transaction',
      primary: true,
      render: (row) => (
        <Link to={`/circulation/loans/${row.id}`} className="font-medium text-slate-800 hover:text-brand-600">
          {row.transactionId}
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
    {
      key: 'resource',
      header: 'Title',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate text-slate-800">{truncate(row.resource?.title, 48)}</p>
          <p className="truncate text-xs text-slate-500">{row.copy?.accessionNumber}</p>
        </div>
      ),
    },
    { key: 'borrowDate', header: 'Borrowed', sortable: true, hideOnMobile: true, render: (row) => formatDate(row.borrowDate) },
    {
      key: 'dueDate',
      header: 'Due',
      sortable: true,
      render: (row) => {
        const remaining = daysUntil(row.dueDate);
        const isOpen = ['active', 'overdue'].includes(row.status);
        return (
          <div className="whitespace-nowrap">
            <p>{formatDate(row.dueDate)}</p>
            {isOpen && (
              <p className={`text-2xs ${remaining < 0 ? 'font-medium text-red-600' : remaining <= 3 ? 'text-amber-600' : 'text-slate-500'}`}>
                {remaining < 0 ? `${Math.abs(remaining)} day(s) late` : remaining === 0 ? 'Due today' : `in ${remaining} day(s)`}
              </p>
            )}
          </div>
        );
      },
    },
    { key: 'returnDate', header: 'Returned', hideOnMobile: true, render: (row) => formatDate(row.returnDate) },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    finesEnabled && {
      key: 'fineAmount',
      header: 'Fine',
      align: 'right',
      hideOnMobile: true,
      render: (row) => (row.fineAmount > 0
        ? <span className="font-medium text-red-600">{formatMoney(row.fineAmount, symbol)}</span>
        : <span className="text-slate-400">-</span>),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => {
        const isOpen = ['active', 'overdue'].includes(row.status);
        const canRenew = isOpen && (can(P.LOAN_RENEW) || (ownOnly && can(P.LOAN_RENEW_OWN)));
        return (
          <div className="flex justify-end gap-0.5">
            <IconButton icon={Eye} label="View loan" onClick={() => { window.location.href = `/circulation/loans/${row.id}`; }} />
            {canRenew && row.renewalCount < row.maxRenewals && (
              <IconButton icon={RefreshCw} label="Renew" tone="success" onClick={() => setRenewTarget(row)} />
            )}
            {isOpen && can(P.LOAN_MARK_LOST) && (
              <IconButton icon={PackageX} label="Mark lost" tone="danger" onClick={() => setLostTarget(row)} />
            )}
            <IconButton
              icon={Printer}
              label="Receipt"
              tone="muted"
              onClick={() => loanApi.receipt(row.id).catch((e) => toast.error(e.message))}
            />
          </div>
        );
      },
    },
  ].filter(Boolean);

  return (
    <>
      <PageHeader
        title={title}
        breadcrumbs={ownOnly
          ? [{ label: 'My library' }, { label: 'Borrowing' }]
          : [{ label: 'Circulation', to: '/circulation' }, { label: 'Loans' }]}
                actions={!ownOnly && (
          <>
            {can(P.LOAN_ISSUE) && (
              <Button as={Link} to="/circulation/borrow">Issue a Book</Button>
            )}
            {can(P.LOAN_RETURN) && (
              <Button as={Link} to="/circulation/return" variant="secondary">Return a Book</Button>
            )}
            <Button variant="secondary" onClick={() => exportAs('pdf')}>PDF</Button>
            <Button variant="secondary" onClick={() => exportAs('xlsx')}>Excel</Button>
          </>
        )}
      />

      <Card noPadding>
        <Tabs tabs={TABS} value={tab} onChange={switchTab} className="px-2" />

        <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3.5">
          <SearchInput
            value={list.search}
            onChange={(e) => list.onSearchChange(e.target.value)}
            placeholder="Search by transaction, member or title…"
            wrapperClassName="min-w-[220px] flex-1"
            aria-label="Search loans"
          />
          <Select
            placeholder="All statuses"
            options={[
              { value: 'active', label: 'Active' },
              { value: 'overdue', label: 'Overdue' },
              { value: 'returned', label: 'Returned' },
              { value: 'lost', label: 'Lost' },
              { value: 'damaged', label: 'Damaged' },
            ]}
            value={list.filters.status || ''}
            onChange={(e) => list.setFilter('status', e.target.value)}
            wrapperClassName="w-44"
            aria-label="Filter by status"
          />
        </div>

        <DataTable
          columns={columns}
          rows={list.items}
          loading={list.isLoading}
          error={list.error}
          onRetry={list.refetch}
          sort={list.sort}
          onSortChange={list.setSort}
          emptyTitle="No loans found"
          emptyDescription={tab === 'overdue' ? 'Nothing is overdue right now.' : 'Try a different filter or search term.'}
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

      <ConfirmDialog
        open={Boolean(renewTarget)}
        onClose={() => setRenewTarget(null)}
        onConfirm={renew}
        loading={busy}
        tone="primary"
        title="Renew this loan?"
        confirmLabel="Renew loan"
        message={`"${renewTarget?.resource?.title}" will be extended by the borrower's standard renewal period. Renewal is refused if another member is waiting for this title.`}
      />

      <Modal
        open={Boolean(lostTarget)}
        onClose={() => setLostTarget(null)}
        title="Write this loan off as lost"
        description={lostTarget?.resource?.title}
        size="sm"
        footer={(
          <>
            <Button variant="secondary" onClick={() => setLostTarget(null)}>Cancel</Button>
            <Button variant="danger" onClick={markLost} loading={busy} disabled={lostReason.trim().length < 3}>
              Mark as lost
            </Button>
          </>
        )}
      >
        <p className="mb-3 text-sm text-slate-600">
          The copy will be recorded as lost.
          {finesEnabled && ' A replacement charge, plus any overdue fine already accrued, will be raised against the borrower.'}
        </p>
        <Textarea
          label="Reason"
          required
          rows={3}
          value={lostReason}
          onChange={(e) => setLostReason(e.target.value)}
          placeholder="e.g. Reported lost by the borrower on 12 May"
        />
      </Modal>
    </>
  );
}
