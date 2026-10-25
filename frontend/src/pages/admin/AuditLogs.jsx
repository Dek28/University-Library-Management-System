import { useState } from 'react';
import { Eye } from 'lucide-react';
import {
  PageHeader, Card, DataTable, Pagination, Button, IconButton, SearchInput,
  Select, Input, Badge, Modal, DetailRow,
} from '../../components/ui';
import { adminApi } from '../../api/endpoints';
import useListQuery from '../../hooks/useListQuery';
import { formatDateTime, humanize } from '../../utils/format';

const ACTION_TONES = {
  login: 'green', logout: 'slate', login_failed: 'red',
  user_created: 'blue', user_updated: 'blue', user_status_changed: 'amber',
  loan_issued: 'blue', loan_returned: 'green', loan_renewed: 'blue', loan_marked_lost: 'red',
  fine_created: 'amber', fine_paid: 'green', fine_waived: 'red', fine_adjusted: 'amber',
  clearance_approved: 'green', clearance_rejected: 'red', clearance_override: 'red',
  resource_deleted: 'red', digital_downloaded: 'slate', settings_updated: 'purple', role_updated: 'purple',
};

/**
 * Audit trail viewer.
 *
 * Entries are append-only server-side, so this screen is deliberately
 * read-only. There is no edit or delete affordance anywhere on it.
 */
export default function AuditLogs() {
  const [showFilters, setShowFilters] = useState(false);
  const [inspecting, setInspecting] = useState(null);

  const list = useListQuery({
    queryKey: ['audit-logs'],
    queryFn: adminApi.auditLogs,
    initialLimit: 25,
    initialFilters: { action: '', entityType: '', status: '' },
  });

  const columns = [
    {
      key: 'createdAt',
      header: 'When',
      primary: true,
      render: (row) => <span className="whitespace-nowrap">{formatDateTime(row.createdAt)}</span>,
    },
    {
      key: 'actorName',
      header: 'Who',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-800">{row.actorName || 'system'}</p>
          {row.actorRole && <p className="truncate text-xs text-slate-500">{humanize(row.actorRole)}</p>}
        </div>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      render: (row) => <Badge tone={ACTION_TONES[row.action] || 'slate'}>{humanize(row.action)}</Badge>,
    },
    {
      key: 'entity',
      header: 'Entity',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate text-slate-700">{row.entityType || '-'}</p>
          {row.entityLabel && <p className="truncate text-xs text-slate-500">{row.entityLabel}</p>}
        </div>
      ),
    },
    { key: 'description', header: 'Detail', hideOnMobile: true, render: (row) => row.description || '-' },
    { key: 'ipAddress', header: 'IP', hideOnMobile: true, render: (row) => row.ipAddress || '-' },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => <IconButton icon={Eye} label="Inspect entry" onClick={() => setInspecting(row)} />,
    },
  ];

  return (
    <>
      <PageHeader
        title="Audit Logs"
        breadcrumbs={[{ label: 'Administration' }, { label: 'Audit logs' }]}
      />

      <Card noPadding>
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3.5">
          <SearchInput
            value={list.search}
            onChange={(e) => list.onSearchChange(e.target.value)}
            placeholder="Search by actor, entity or description…"
            wrapperClassName="min-w-[240px] flex-1"
            aria-label="Search the audit trail"
          />
          <Button variant="secondary" onClick={() => setShowFilters((v) => !v)}>
            Filters{list.activeFilterCount > 0 && ` (${list.activeFilterCount})`}
          </Button>
        </div>

        {showFilters && (
          <div className="grid gap-3 border-b border-line bg-slate-50/60 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
            <Select
              label="Action"
              placeholder="All actions"
              options={Object.keys(ACTION_TONES).map((action) => ({ value: action, label: humanize(action) }))}
              value={list.filters.action || ''}
              onChange={(e) => list.setFilter('action', e.target.value)}
            />
            <Select
              label="Entity type"
              placeholder="All entities"
              options={['User', 'Loan', 'Fine', 'Resource', 'ResourceCopy', 'Clearance', 'Reservation', 'DigitalResource', 'Role', 'SystemSetting']
                .map((value) => ({ value, label: value }))}
              value={list.filters.entityType || ''}
              onChange={(e) => list.setFilter('entityType', e.target.value)}
            />
            <Input label="From" type="date" value={list.filters.from || ''} onChange={(e) => list.setFilter('from', e.target.value)} />
            <Input label="To" type="date" value={list.filters.to || ''} onChange={(e) => list.setFilter('to', e.target.value)} />
          </div>
        )}

        <DataTable
          columns={columns}
          rows={list.items}
          loading={list.isLoading}
          error={list.error}
          onRetry={list.refetch}
          emptyTitle="No audit entries"
          emptyDescription="Actions recorded by the system will appear here."
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
        open={Boolean(inspecting)}
        onClose={() => setInspecting(null)}
        title="Audit entry"
        description={inspecting ? formatDateTime(inspecting.createdAt) : ''}
        size="lg"
      >
        {inspecting && (
          <>
            <dl className="divide-y divide-line">
              <DetailRow label="Action">{humanize(inspecting.action)}</DetailRow>
              <DetailRow label="Actor">{inspecting.actorName} {inspecting.actorRole ? `(${humanize(inspecting.actorRole)})` : ''}</DetailRow>
              <DetailRow label="Entity">{inspecting.entityType} {inspecting.entityLabel ? `· ${inspecting.entityLabel}` : ''}</DetailRow>
              <DetailRow label="Entity ID">{inspecting.entityId || '-'}</DetailRow>
              <DetailRow label="Outcome">
                <Badge tone={inspecting.status === 'failure' ? 'red' : 'green'}>{humanize(inspecting.status)}</Badge>
              </DetailRow>
              <DetailRow label="Request">{inspecting.method} {inspecting.path}</DetailRow>
              <DetailRow label="IP address">{inspecting.ipAddress || '-'}</DetailRow>
              <DetailRow label="User agent">
                <span className="break-all text-xs text-slate-500">{inspecting.userAgent || '-'}</span>
              </DetailRow>
              {inspecting.description && <DetailRow label="Description">{inspecting.description}</DetailRow>}
            </dl>

            {(inspecting.oldValue || inspecting.newValue) && (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {inspecting.oldValue && (
                  <div>
                    <p className="mb-1.5 text-xs font-semibold text-slate-700">Before</p>
                    <pre className="max-h-60 overflow-auto rounded-md bg-slate-50 p-3 text-2xs text-slate-700">
                      {JSON.stringify(inspecting.oldValue, null, 2)}
                    </pre>
                  </div>
                )}
                {inspecting.newValue && (
                  <div>
                    <p className="mb-1.5 text-xs font-semibold text-slate-700">After</p>
                    <pre className="max-h-60 overflow-auto rounded-md bg-slate-50 p-3 text-2xs text-slate-700">
                      {JSON.stringify(inspecting.newValue, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </Modal>
    </>
  );
}
