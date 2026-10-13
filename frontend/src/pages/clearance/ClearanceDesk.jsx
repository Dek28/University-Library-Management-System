import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Search, ShieldAlert } from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import {
  PageHeader, Card, Button, Input, DataTable, Pagination, StatusBadge, Badge,
  Avatar, DetailRow, Modal, Textarea, Checkbox, Tabs, SearchInput, Select, StatCard,
} from '../../components/ui';
import { clearanceApi } from '../../api/endpoints';
import useListQuery from '../../hooks/useListQuery';
import { useAuthStore } from '../../store/auth';
import useFinesEnabled from '../../hooks/useFinesEnabled';
import { P } from '../../constants';
import { formatMoney, formatDate, fullName, memberIdentifier } from '../../utils/format';

/** Approve dialog, including the audited override path. */
function ApproveDialog({ clearance, open, onClose, onSaved, canOverride, blocked }) {
  const [comments, setComments] = useState('');
  const [override, setOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await clearanceApi.approve(clearance.id, { comments, override, overrideReason });
      toast.success(override ? 'Clearance granted by override' : 'Clearance granted');
      onSaved();
      onClose();
      setComments(''); setOverride(false); setOverrideReason('');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  const overrideValid = !override || overrideReason.trim().length >= 10;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Grant library clearance"
      description={clearance ? clearance.clearanceCode : ''}
      size="sm"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={busy} disabled={!overrideValid || (blocked && !override)}>
            Grant clearance
          </Button>
        </>
      )}
    >
      <div className="space-y-4">
        {blocked && (
          <div className="flex items-start gap-2.5 rounded-md border border-red-200 bg-red-50 px-3.5 py-3">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
            <div className="text-sm text-red-800">
              <p className="font-medium">This member still has outstanding obligations.</p>
              <ul className="mt-1 list-inside list-disc">
                {(clearance?.blockingReasons || []).map((reason) => <li key={reason}>{reason}</li>)}
              </ul>
            </div>
          </div>
        )}

        <Textarea label="Comments" rows={2} value={comments} onChange={(e) => setComments(e.target.value)} />

        {blocked && canOverride && (
          <>
            <Checkbox
              label="Override the obligation check"
              checked={override}
              onChange={(e) => setOverride(e.target.checked)}
            />
            {override && (
              <Textarea
                label="Override reason"
                required
                rows={3}
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                hint="At least 10 characters."
                placeholder="e.g. Head of library approved a waiver following the appeals committee"
              />
            )}
          </>
        )}

        {blocked && !canOverride && (
          <p className="text-sm text-slate-600">
            You are not authorised to override obligations. Ask an administrator, or have the member
            settle the items above first.
          </p>
        )}
      </div>
    </Modal>
  );
}

/** Search a member and evaluate their obligations live. */
function MemberCheck() {
  const can = useAuthStore((state) => state.can);
  const settings = useAuthStore((state) => state.settings);
  const symbol = settings?.locale?.currencySymbol || '$';
  const finesEnabled = useFinesEnabled();

  const [identifier, setIdentifier] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [approveTarget, setApproveTarget] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  const search = async (event) => {
    event?.preventDefault();
    if (!identifier.trim()) return;
    setBusy(true);
    try {
      setResult(await clearanceApi.check({ identifier: identifier.trim() }));
    } catch (error) {
      setResult(null);
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  const refresh = async () => {
    if (result?.member?.id) {
      setResult(await clearanceApi.check({ userId: result.member.id }));
    }
  };

  const openCase = async () => {
    setBusy(true);
    try {
      await clearanceApi.requestFor(result.member.id);
      toast.success('Clearance case recorded');
      await refresh();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  const reject = async () => {
    setBusy(true);
    try {
      await clearanceApi.reject(rejectTarget.id, { reason: rejectReason });
      toast.success('Clearance rejected');
      setRejectTarget(null);
      setRejectReason('');
      await refresh();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  const clearance = result?.currentClearance;
  const items = result ? [
    { label: 'Books Returned', ok: result.obligations.activeLoans === 0, detail: `${result.obligations.activeLoans} still on loan` },
    { label: 'Overdue Items', ok: result.obligations.overdueLoans === 0, detail: `${result.obligations.overdueLoans} overdue` },
    { label: 'Lost Items', ok: result.obligations.lostItems === 0, detail: `${result.obligations.lostItems} recorded lost` },
    finesEnabled && { label: 'Outstanding Fines', ok: result.obligations.outstandingFineTotal === 0, detail: formatMoney(result.obligations.outstandingFineTotal, symbol) },
    { label: 'Damaged Items', ok: result.obligations.damagedItems === 0, detail: `${result.obligations.damagedItems} recorded damaged` },
  ].filter(Boolean) : [];

  return (
    <>
      <Card className="mb-4">
        <form onSubmit={search} className="flex gap-2">
          <Input
            wrapperClassName="flex-1"
            placeholder="Search student by ID or name…"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            aria-label="Member identifier"
            autoFocus
          />
          <Button type="submit" loading={busy && !result} className="mt-[26px] h-9 self-start">Search</Button>
        </form>
      </Card>

      {result && (
        <div className="grid gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-2" title="Clearance check">
            <div className="flex items-start gap-4 border-b border-line pb-4">
              <Avatar user={{ firstName: result.member.fullName?.split(' ')[0], lastName: result.member.fullName?.split(' ').slice(-1)[0] }} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="text-md font-semibold text-slate-900">{result.member.fullName}</p>
                <p className="text-xs text-slate-500">{result.member.identifier} · {result.member.email}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {result.member.department?.name || 'No department'}
                  {result.member.program?.name ? ` · ${result.member.program.name}` : ''}
                  {result.member.graduationYear ? ` · class of ${result.member.graduationYear}` : ''}
                </p>
              </div>
              <StatusBadge status={result.member.status} />
            </div>

            <table className="mt-4 w-full text-sm">
              <thead>
                <tr className="border-b border-line">
                  <th className="pb-2 text-left text-xs font-semibold text-slate-600">Clearance item</th>
                  <th className="pb-2 text-left text-xs font-semibold text-slate-600">Detail</th>
                  <th className="pb-2 text-right text-xs font-semibold text-slate-600">Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.label} className="border-b border-line">
                    <td className="py-2.5 text-sm text-slate-700">{item.label}</td>
                    <td className="py-2.5 text-sm text-slate-500">{item.detail}</td>
                    <td className="py-2.5 text-right">
                      <span className={clsx('text-sm font-semibold', item.ok ? 'text-emerald-600' : 'text-red-600')}>
                        {item.ok ? 'Cleared' : 'Outstanding'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 px-4 py-3.5">
              <div>
                <p className="text-xs text-slate-500">Clearance status</p>
                <p className={clsx('text-lg font-bold', result.isClear ? 'text-emerald-600' : 'text-red-600')}>
                  {result.isClear ? 'CLEARED' : 'BLOCKED'}
                </p>
              </div>
              <p className="max-w-sm text-xs text-slate-500">
                {result.isClear
                  ? 'No outstanding obligations.'
                  : result.blockingReasons.join('; ')}
              </p>
            </div>

            {can(P.CLEARANCE_PROCESS) && (
              <div className="mt-4 flex flex-wrap gap-2">
                {!clearance || !['pending', 'blocked'].includes(clearance.status) ? (
                  <Button onClick={openCase} loading={busy}>Record clearance check</Button>
                ) : (
                  <>
                    <Button onClick={() => setApproveTarget(clearance)}>Approve clearance</Button>
                    <Button variant="danger" onClick={() => setRejectTarget(clearance)}>Reject</Button>
                  </>
                )}
                {clearance?.status === 'cleared' && (
                  <Button
                    variant="secondary"
                    onClick={() => clearanceApi.certificate(clearance.id, clearance.clearanceCode).catch((e) => toast.error(e.message))}
                  >
                    Print Clearance
                  </Button>
                )}
              </div>
            )}
          </Card>

          <div className="space-y-4">
            {clearance && (
              <Card title="Current clearance record">
                <dl className="divide-y divide-line">
                  <DetailRow label="Reference">{clearance.clearanceCode}</DetailRow>
                  <DetailRow label="Status"><StatusBadge status={clearance.status} /></DetailRow>
                  <DetailRow label="Requested">{formatDate(clearance.requestedAt)}</DetailRow>
                  <DetailRow label="Verified by">{clearance.verifiedBy ? fullName(clearance.verifiedBy) : '-'}</DetailRow>
                  <DetailRow label="Verified on">{formatDate(clearance.verifiedAt)}</DetailRow>
                  {clearance.certificateNumber && <DetailRow label="Certificate">{clearance.certificateNumber}</DetailRow>}
                  {clearance.isOverride && (
                    <DetailRow label="Override">
                      <Badge tone="amber">Granted by override</Badge>
                      <p className="mt-1 text-xs text-slate-500">{clearance.overrideReason}</p>
                    </DetailRow>
                  )}
                  {clearance.comments && <DetailRow label="Comments">{clearance.comments}</DetailRow>}
                </dl>
              </Card>
            )}

            {result.fines?.length > 0 && (
              <Card title="Unpaid fines" noPadding>
                <ul className="divide-y divide-line">
                  {result.fines.map((fine) => (
                    <li key={fine._id || fine.id} className="flex items-center justify-between gap-3 px-5 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800">{fine.fineCode}</p>
                        <p className="truncate text-xs text-slate-500">{fine.resource?.title || fine.reason}</p>
                      </div>
                      <span className="shrink-0 text-sm font-semibold text-red-600">
                        {formatMoney(fine.amount - fine.amountPaid - fine.amountWaived, symbol)}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        </div>
      )}

      <ApproveDialog
        clearance={approveTarget}
        open={Boolean(approveTarget)}
        onClose={() => setApproveTarget(null)}
        onSaved={refresh}
        canOverride={can(P.CLEARANCE_OVERRIDE)}
        blocked={!result?.isClear}
      />

      <Modal
        open={Boolean(rejectTarget)}
        onClose={() => setRejectTarget(null)}
        title="Reject this clearance request"
        size="sm"
        footer={(
          <>
            <Button variant="secondary" onClick={() => setRejectTarget(null)}>Cancel</Button>
            <Button variant="danger" onClick={reject} loading={busy} disabled={rejectReason.trim().length < 5}>Reject</Button>
          </>
        )}
      >
        <Textarea
          label="Reason"
          required
          rows={3}
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          placeholder="Explain what the member must resolve"
        />
      </Modal>
    </>
  );
}

/** Register of every clearance record. */
function ClearanceRegister() {
  const settings = useAuthStore((state) => state.settings);
  const symbol = settings?.locale?.currencySymbol || '$';
  const finesEnabled = useFinesEnabled();

  const list = useListQuery({
    queryKey: ['clearance'],
    queryFn: clearanceApi.list,
    initialFilters: { status: '' },
  });

  const exportAs = async (format) => {
    try {
      await clearanceApi.export(list.params, format);
      toast.success(`Exported as ${format.toUpperCase()}`);
    } catch (error) {
      toast.error(error.message);
    }
  };

  const columns = [
    { key: 'clearanceCode', header: 'Reference', primary: true },
    {
      key: 'user',
      header: 'Member',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-800">{fullName(row.user)}</p>
          <p className="truncate text-xs text-slate-500">{memberIdentifier(row.user)}</p>
        </div>
      ),
    },
    { key: 'department', header: 'Department', hideOnMobile: true, render: (row) => row.user?.department?.name || '-' },
    { key: 'activeLoans', header: 'On loan', align: 'right', render: (row) => row.obligations?.activeLoans ?? 0 },
    finesEnabled && {
      key: 'fines',
      header: 'Fines',
      align: 'right',
      render: (row) => formatMoney(row.obligations?.outstandingFineTotal, symbol),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <div className="flex items-center gap-1.5">
          <StatusBadge status={row.status} />
          {row.isOverride && <Badge tone="amber">Override</Badge>}
        </div>
      ),
    },
    { key: 'verifiedAt', header: 'Verified', hideOnMobile: true, render: (row) => formatDate(row.verifiedAt) },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (row.status === 'cleared' ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => clearanceApi.certificate(row.id, row.clearanceCode).catch((e) => toast.error(e.message))}
        >
          Certificate
        </Button>
      ) : null),
    },
  ].filter(Boolean);

  return (
    <Card noPadding>
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3.5">
        <SearchInput
          value={list.search}
          onChange={(e) => list.onSearchChange(e.target.value)}
          placeholder="Search by member…"
          wrapperClassName="min-w-[220px] flex-1"
          aria-label="Search clearance records"
        />
        <Select
          placeholder="All statuses"
          options={[
            { value: 'pending', label: 'Pending' },
            { value: 'blocked', label: 'Blocked' },
            { value: 'cleared', label: 'Cleared' },
            { value: 'rejected', label: 'Rejected' },
          ]}
          value={list.filters.status || ''}
          onChange={(e) => list.setFilter('status', e.target.value)}
          wrapperClassName="w-44"
          aria-label="Filter by status"
        />
        <Button variant="secondary" onClick={() => exportAs('pdf')}>PDF</Button>
        <Button variant="secondary" onClick={() => exportAs('xlsx')}>Excel</Button>
      </div>

      <DataTable
        columns={columns}
        rows={list.items}
        loading={list.isLoading}
        error={list.error}
        onRetry={list.refetch}
        emptyTitle="No clearance records"
        emptyDescription="Records appear here once a clearance check has been run for a member."
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
  );
}

export default function ClearanceDesk() {
  const [tab, setTab] = useState('check');

  const { data: stats } = useQuery({
    queryKey: ['clearance', 'statistics'],
    queryFn: clearanceApi.statistics,
    staleTime: 60_000,
  });

  return (
    <>
      <PageHeader
        title="Student Clearance"
        breadcrumbs={[{ label: 'Student Clearance' }]}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Cleared" value={stats?.cleared || 0} tone="green" />
        <StatCard label="Pending" value={stats?.pending || 0} tone="amber" />
        <StatCard label="Blocked" value={stats?.blocked || 0} tone="red" />
        <StatCard label="Rejected" value={stats?.rejected || 0} tone="slate" />
      </div>

      <Tabs
        className="mb-4"
        tabs={[
          { key: 'check', label: 'Check a member' },
          { key: 'register', label: 'Clearance register' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'check' ? <MemberCheck /> : <ClearanceRegister />}
    </>
  );
}
