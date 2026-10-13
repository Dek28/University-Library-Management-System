import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  PageHeader, Card, StatCard, DataTable, Pagination, Button, Input, Select,
  Textarea, StatusBadge, Modal, ConfirmDialog, PageLoader, ErrorState, Badge, Checkbox, CameraScanButton,
} from '../../components/ui';
import { inventoryApi, referenceApi } from '../../api/endpoints';
import useListQuery from '../../hooks/useListQuery';
import { useAuthStore } from '../../store/auth';
import { P, COPY_CONDITIONS } from '../../constants';
import { formatDate, formatDateTime, fullName, humanize, shelfLabel } from '../../utils/format';

/** Opens a new stock-verification exercise. */
function StartAuditDialog({ open, onClose, onStarted }) {
  const [title, setTitle] = useState('');
  const [shelf, setShelf] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  const { data: shelves } = useQuery({
    queryKey: ['reference', 'shelves', 'options'],
    queryFn: () => referenceApi.list('shelves', { limit: 200 }),
    enabled: open,
    staleTime: 5 * 60_000,
  });

  const submit = async () => {
    setBusy(true);
    try {
      const audit = await inventoryApi.startAudit({ title, shelf: shelf || undefined, description });
      toast.success('Stock verification started');
      onStarted(audit);
      onClose();
      setTitle(''); setShelf(''); setDescription('');
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
      title="Start a stock verification"
      description="Only one verification can be open at a time."
      size="sm"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={busy} disabled={title.trim().length < 3}>Start verification</Button>
        </>
      )}
    >
      <div className="space-y-4">
        <Input label="Title" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Computing section, May 2026" />
        <Select
          label="Limit to a shelf"
          placeholder="Whole library"
          options={(shelves?.items || []).map((s) => ({ value: s.id, label: shelfLabel(s) }))}
          value={shelf}
          onChange={(e) => setShelf(e.target.value)}
          hint="The expected count is snapshotted when the verification starts."
        />
        <Textarea label="Description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
    </Modal>
  );
}

/** Scan-and-record screen for an in-progress audit. */
export function AuditDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const can = useAuthStore((state) => state.can);

  const [scan, setScan] = useState('');
  const [foundStatus, setFoundStatus] = useState('found');
  const [condition, setCondition] = useState('good');
  const [remark, setRemark] = useState('');
  const [busy, setBusy] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [applyAdjustments, setApplyAdjustments] = useState(true);
  const [cancelOpen, setCancelOpen] = useState(false);

  const { data: audit, isLoading, error, refetch } = useQuery({
    queryKey: ['inventory', 'audit', id],
    queryFn: () => inventoryApi.audit(id),
  });

  if (isLoading) return <PageLoader label="Loading verification…" />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;
  if (!audit) return null;

  // `value` lets a camera scan record immediately, before state has updated.
  const record = async (event, value = scan) => {
    event?.preventDefault();
    if (!value.trim()) return;
    setBusy(true);
    try {
      await inventoryApi.recordItem(id, { identifier: value.trim(), foundStatus, condition, remark });
      toast.success(`Recorded ${value.trim()} as ${foundStatus}`);
      setScan('');
      setRemark('');
      refetch();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const complete = async () => {
    setBusy(true);
    try {
      const result = await inventoryApi.completeAudit(id, { applyAdjustments });
      toast.success(`Verification completed. ${result.adjustments.length} status change(s) applied.`);
      setCompleteOpen(false);
      refetch();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    setBusy(true);
    try {
      await inventoryApi.cancelAudit(id, { reason: 'Cancelled from the verification screen' });
      toast.success('Verification cancelled');
      setCancelOpen(false);
      refetch();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const isOpen = audit.status === 'in_progress';
  const unaccounted = Math.max(0, (audit.expectedCount || 0) - (audit.verifiedCount || 0));

  const itemColumns = [
    { key: 'accessionNumber', header: 'Accession', primary: true },
    { key: 'expectedStatus', header: 'Expected', render: (row) => <StatusBadge status={row.expectedStatus} /> },
    {
      key: 'foundStatus',
      header: 'Found',
      render: (row) => (
        <Badge tone={{ found: 'green', missing: 'red', damaged: 'amber', misplaced: 'blue' }[row.foundStatus]}>
          {humanize(row.foundStatus)}
        </Badge>
      ),
    },
    { key: 'condition', header: 'Condition', render: (row) => humanize(row.condition) },
    { key: 'remark', hideWhenEmpty: true, header: 'Remark', hideOnMobile: true, render: (row) => row.remark || '-' },
    { key: 'verifiedAt', header: 'Verified', hideOnMobile: true, render: (row) => formatDateTime(row.verifiedAt) },
  ];

  return (
    <>
      <PageHeader
        title={audit.title}
        breadcrumbs={[
          { label: 'Inventory', to: '/inventory' },
          { label: 'Stock verification', to: '/inventory/audits' },
          { label: audit.auditCode },
        ]}
        actions={(
          <>
            <Button as={Link} to="/inventory/audits" variant="secondary">Back</Button>
            {isOpen && can(P.INVENTORY_MANAGE) && (
              <>
                <Button variant="secondary" onClick={() => setCancelOpen(true)}>Cancel</Button>
                <Button onClick={() => setCompleteOpen(true)}>Complete</Button>
              </>
            )}
          </>
        )}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Expected" value={audit.expectedCount} tone="blue" />
        <StatCard label="Verified" value={audit.verifiedCount} tone="green" />
        <StatCard label="Missing" value={audit.missingCount} tone="red" />
        <StatCard label="Damaged" value={audit.damagedCount} tone="amber" />
        <StatCard label="Not yet scanned" value={unaccounted} tone="slate" />
      </div>

      {isOpen && can(P.INVENTORY_MANAGE) && (
        <Card className="mb-4" title="Record a scanned copy">
          <form onSubmit={record} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Input
              label="Barcode or accession"
              wrapperClassName="lg:col-span-2"
              value={scan}
              onChange={(e) => setScan(e.target.value)}
              placeholder="Scan the item"
              autoFocus
            />
            <Select
              label="Outcome"
              value={foundStatus}
              onChange={(e) => setFoundStatus(e.target.value)}
              options={[
                { value: 'found', label: 'Found on shelf' },
                { value: 'missing', label: 'Missing' },
                { value: 'damaged', label: 'Damaged' },
                { value: 'misplaced', label: 'Misplaced' },
              ]}
            />
            <Select label="Condition" options={COPY_CONDITIONS} value={condition} onChange={(e) => setCondition(e.target.value)} />
            <div className="flex items-end gap-2">
              <CameraScanButton
                title="Scan a copy"
                disabled={busy}
                onDetected={(code) => { setScan(code); record(null, code); }}
              />
              <Button type="submit" loading={busy} className="flex-1">Record</Button>
            </div>
            <Input
              label="Remark (optional)"
              wrapperClassName="sm:col-span-2 lg:col-span-5"
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
            />
          </form>
          <p className="mt-3 text-xs text-slate-500">
            Re-scanning a copy replaces its earlier entry, so a corrected scan never double-counts.
          </p>
        </Card>
      )}

      <Card title="Scanned copies" subtitle={`${audit.items?.length || 0} recorded`} noPadding>
        <DataTable
          columns={itemColumns}
          rows={audit.items || []}
          rowKey={(row) => row._id || row.id || row.accessionNumber}
          emptyTitle="Nothing scanned yet"
          emptyDescription="Scan the first copy to begin the verification."
        />
      </Card>

      <Modal
        open={completeOpen}
        onClose={() => setCompleteOpen(false)}
        title="Complete this verification"
        size="sm"
        footer={(
          <>
            <Button variant="secondary" onClick={() => setCompleteOpen(false)}>Cancel</Button>
            <Button onClick={complete} loading={busy}>Complete verification</Button>
          </>
        )}
      >
        <p className="text-sm text-slate-600">
          {audit.missingCount} copy/copies were reported missing and {audit.damagedCount} damaged.
        </p>
        <div className="mt-4">
          <Checkbox
            label="Apply the outcomes to the copies"
            checked={applyAdjustments}
            onChange={(e) => setApplyAdjustments(e.target.checked)}
          />
        </div>
      </Modal>

      <ConfirmDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={cancel}
        loading={busy}
        title="Cancel this verification?"
        confirmLabel="Cancel verification"
        message="The record is kept for audit purposes, but no copy statuses will be changed."
      />
    </>
  );
}

/** List of past and current verification exercises. */
export default function StockAudits() {
  const can = useAuthStore((state) => state.can);
  const navigate = useNavigate();
  const [startOpen, setStartOpen] = useState(false);

  const list = useListQuery({
    queryKey: ['inventory', 'audits'],
    queryFn: inventoryApi.audits,
  });

  const columns = [
    {
      key: 'auditCode',
      header: 'Reference',
      primary: true,
      render: (row) => (
        <Link to={`/inventory/audits/${row.id}`} className="font-medium text-slate-800 hover:text-brand-600">
          {row.auditCode}
        </Link>
      ),
    },
    { key: 'title', header: 'Title' },
    { key: 'shelf', header: 'Scope', render: (row) => shelfLabel(row.shelf, 'Whole library') },
    { key: 'expectedCount', header: 'Expected', align: 'right' },
    { key: 'verifiedCount', header: 'Verified', align: 'right' },
    { key: 'missingCount', header: 'Missing', align: 'right', render: (row) => (row.missingCount > 0 ? <span className="font-medium text-red-600">{row.missingCount}</span> : 0) },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    { key: 'startedAt', header: 'Started', hideOnMobile: true, render: (row) => formatDate(row.startedAt) },
    { key: 'startedBy', header: 'By', hideOnMobile: true, render: (row) => fullName(row.startedBy) },
  ];

  return (
    <>
      <PageHeader
        title="Stock verification"
        breadcrumbs={[{ label: 'Inventory', to: '/inventory' }, { label: 'Stock verification' }]}
        actions={can(P.INVENTORY_MANAGE) && <Button onClick={() => setStartOpen(true)}>Start verification</Button>}
      />

      <Card noPadding>
        <DataTable
          columns={columns}
          rows={list.items}
          loading={list.isLoading}
          error={list.error}
          onRetry={list.refetch}
          onRowClick={(row) => navigate(`/inventory/audits/${row.id}`)}
          emptyTitle="No verifications recorded"
          emptyDescription="Start one to check the shelves against the catalogue."
          emptyAction={can(P.INVENTORY_MANAGE) ? <Button size="sm" onClick={() => setStartOpen(true)}>Start verification</Button> : undefined}
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

      <StartAuditDialog
        open={startOpen}
        onClose={() => setStartOpen(false)}
        onStarted={(audit) => navigate(`/inventory/audits/${audit.id}`)}
      />
    </>
  );
}
