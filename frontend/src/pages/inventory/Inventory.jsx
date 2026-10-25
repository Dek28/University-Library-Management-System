import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Settings2 } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  PageHeader,
  Card,
  StatCard,
  DataTable,
  Pagination,
  Button,
  IconButton,
  SearchInput,
  Select,
  StatusBadge,
  Modal,
  Textarea,
  Tabs,
} from '../../components/ui';
import { inventoryApi } from '../../api/endpoints';
import useListQuery from '../../hooks/useListQuery';
import { useAuthStore } from '../../store/auth';
import { P, COPY_CONDITIONS } from '../../constants';
import { formatNumber, formatDate, humanize, shelfLabel } from '../../utils/format';

/** Changes a single copy's status outside a formal stock audit. */
function AdjustDialog({ copy, open, onClose, onSaved }) {
  const [status, setStatus] = useState('available');
  const [condition, setCondition] = useState('good');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await inventoryApi.adjustCopy(copy.id, { status, condition, reason });
      toast.success('Copy status adjusted');
      onSaved();
      onClose();
      setReason('');
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
      title="Adjust copy status"
      description={copy ? `${copy.accessionNumber} · ${copy.resource?.title}` : ''}
      size="sm"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={busy} disabled={reason.trim().length < 3}>Apply adjustment</Button>
        </>
      )}
    >
      <div className="space-y-4">
        <Select
          label="New status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={[
            { value: 'available', label: 'Available' },
            { value: 'damaged', label: 'Damaged' },
            { value: 'lost', label: 'Lost' },
            { value: 'missing', label: 'Missing' },
            { value: 'under_repair', label: 'Under repair' },
            { value: 'withdrawn', label: 'Withdrawn' },
            { value: 'reference_only', label: 'Reference only' },
          ]}
          hint="A copy that is on loan must be processed at the returns desk instead."
        />
        <Select label="Condition" options={COPY_CONDITIONS} value={condition} onChange={(e) => setCondition(e.target.value)} />
        <Textarea label="Reason" required rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Recorded in the audit trail" />
      </div>
    </Modal>
  );
}

/** Copies filtered to one status; also serves the lost/damaged/withdrawn screens. */
function CopyStatusList({ status }) {
  const can = useAuthStore((state) => state.can);
  const [adjusting, setAdjusting] = useState(null);

  const list = useListQuery({
    queryKey: ['inventory', 'copies', status],
    queryFn: (params) => inventoryApi.copiesByStatus(status, params),
    initialLimit: 25,
  });

  const columns = [
    { key: 'accessionNumber', header: 'Accession', primary: true, render: (row) => <span className="font-medium text-slate-800">{row.accessionNumber}</span> },
    { key: 'barcode', header: 'Barcode', render: (row) => <span className="font-mono text-xs">{row.barcode}</span> },
    {
      key: 'resource',
      header: 'Title',
      render: (row) => (
        <Link to={`/catalog/${row.resource?.id}`} className="text-slate-800 hover:text-brand-600">
          {row.resource?.title || '-'}
        </Link>
      ),
    },
    { key: 'shelf', hideWhenEmpty: true, header: 'Shelf', hideOnMobile: true, render: (row) => shelfLabel(row.shelf) },
    { key: 'condition', header: 'Condition', render: (row) => humanize(row.condition) },
    { key: 'lastVerifiedAt', header: 'Last verified', hideOnMobile: true, render: (row) => formatDate(row.lastVerifiedAt) },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (can(P.INVENTORY_MANAGE) ? (
        <IconButton icon={Settings2} label="Adjust status" tone="success" onClick={() => setAdjusting(row)} />
      ) : null),
    },
  ];

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3.5">
        <SearchInput
          value={list.search}
          onChange={(e) => list.onSearchChange(e.target.value)}
          placeholder="Search accession number or barcode…"
          wrapperClassName="min-w-[220px] flex-1"
          aria-label="Search copies"
        />
      </div>

      <DataTable
        columns={columns}
        rows={list.items}
        loading={list.isLoading}
        error={list.error}
        onRetry={list.refetch}
        emptyTitle={`No copies with status “${humanize(status)}”`}
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

      <AdjustDialog
        copy={adjusting}
        open={Boolean(adjusting)}
        onClose={() => setAdjusting(null)}
        onSaved={list.refetch}
      />
    </>
  );
}

export default function Inventory() {
  const { status } = useParams();
  const can = useAuthStore((state) => state.can);
  const [tab, setTab] = useState(status || 'overview');

  const { data: summary, isLoading } = useQuery({
    queryKey: ['inventory', 'summary'],
    queryFn: () => inventoryApi.summary(),
    staleTime: 60_000,
  });

  const byStatus = summary?.byStatus || {};

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'available', label: 'Available', count: byStatus.available || 0 },
    { key: 'borrowed', label: 'Borrowed', count: byStatus.borrowed || 0 },
    { key: 'damaged', label: 'Damaged', count: byStatus.damaged || 0 },
    { key: 'lost', label: 'Lost', count: byStatus.lost || 0 },
    { key: 'missing', label: 'Missing', count: byStatus.missing || 0 },
    { key: 'withdrawn', label: 'Withdrawn', count: byStatus.withdrawn || 0 },
  ];

  return (
    <>
      <PageHeader
        title="Inventory Management"
        breadcrumbs={[{ label: 'Inventory' }]}
        actions={can(P.INVENTORY_MANAGE) && (
          <Button as={Link} to="/inventory/audits">Stock verification</Button>
        )}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total copies" value={formatNumber(summary?.total)} tone="blue" loading={isLoading} />
        <StatCard label="Available" value={formatNumber(byStatus.available)} tone="green" loading={isLoading} />
        <StatCard label="Borrowed" value={formatNumber(byStatus.borrowed)} tone="amber" loading={isLoading} />
        <StatCard
          label="Lost or damaged"
          value={formatNumber((byStatus.lost || 0) + (byStatus.damaged || 0) + (byStatus.missing || 0))}
          tone="red"
          loading={isLoading}
        />
      </div>

      <Card noPadding>
        <Tabs tabs={tabs} value={tab} onChange={setTab} className="px-2" />

        {tab === 'overview' ? (
          <div className="p-5">
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th className="text-right">Copies</th>
                    <th className="text-right">Share</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(byStatus).sort((a, b) => b[1] - a[1]).map(([key, count]) => (
                    <tr key={key}>
                      <td><StatusBadge status={key} /></td>
                      <td className="text-right font-medium">{formatNumber(count)}</td>
                      <td className="text-right text-slate-500">
                        {summary?.total ? `${Math.round((count / summary.total) * 100)}%` : '-'}
                      </td>
                      <td className="text-right">
                        <button
                          type="button"
                          onClick={() => setTab(key)}
                          className="text-sm font-medium text-brand-600 hover:underline"
                        >
                          View copies
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!isLoading && Object.keys(byStatus).length === 0 && (
                    <tr><td colSpan={4} className="py-8 text-center text-sm text-slate-500">No copies recorded yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <CopyStatusList status={tab} />
        )}
      </Card>
    </>
  );
}
