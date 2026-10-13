import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Eye, Pencil, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  PageHeader, Card, DataTable, Pagination, Button, IconButton, SearchInput,
  Select, StatusBadge, ConfirmDialog,
} from '../../components/ui';
import { groupApi, referenceApi } from '../../api/endpoints';
import useListQuery from '../../hooks/useListQuery';
import { useAuthStore } from '../../store/auth';
import { P, GROUP_STATUSES } from '../../constants';
import { fullName, formatDate } from '../../utils/format';
import GroupForm from './GroupForm';

export default function ReadingGroups() {
  const can = useAuthStore((state) => state.can);
  const navigate = useNavigate();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [busy, setBusy] = useState(false);

  const list = useListQuery({
    queryKey: ['reading-groups'],
    queryFn: groupApi.list,
    initialFilters: { status: '', department: '' },
  });

  const { data: departments } = useQuery({
    queryKey: ['reference', 'departments', 'options'],
    queryFn: () => referenceApi.list('departments', { limit: 200 }),
    staleTime: 5 * 60_000,
  });

  const remove = async () => {
    setBusy(true);
    try {
      await groupApi.remove(toDelete.id);
      toast.success('Reading group deleted');
      setToDelete(null);
      list.refetch();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  const columns = [
    {
      key: 'name',
      header: 'Group Name',
      primary: true,
      render: (row) => (
        <Link to={`/reading-groups/${row.id}`} className="font-medium text-slate-800 hover:text-brand-600">
          {row.name}
        </Link>
      ),
    },
    { key: 'readingTopic', header: 'Description', render: (row) => row.readingTopic || row.description || '-' },
    { key: 'leader', header: 'Leader', hideOnMobile: true, render: (row) => fullName(row.leader) || '-' },
    { key: 'department', hideWhenEmpty: true, header: 'Department', hideOnMobile: true, render: (row) => row.department?.name || '-' },
    { key: 'members', header: 'Members', align: 'center', render: (row) => (row.members || []).length },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <div className="flex justify-end gap-0.5">
          <IconButton icon={Eye} label="Open group" onClick={() => navigate(`/reading-groups/${row.id}`)} />
          {can(P.GROUP_MANAGE) && (
            <>
              <IconButton icon={Pencil} label="Edit group" tone="success" onClick={() => { setEditing(row); setFormOpen(true); }} />
              <IconButton icon={Trash2} label="Delete group" tone="danger" onClick={() => setToDelete(row)} />
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Student Groups"
        breadcrumbs={[{ label: 'Student Groups' }]}
        actions={(
          <>
            <Button as={Link} to="/reading-groups/schedule" variant="secondary">Schedule</Button>
            {can(P.GROUP_MANAGE) && (
              <Button onClick={() => { setEditing(null); setFormOpen(true); }}>Create Group</Button>
            )}
          </>
        )}
      />

      <Card noPadding>
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3.5">
          <SearchInput
            value={list.search}
            onChange={(e) => list.onSearchChange(e.target.value)}
            placeholder="Search groups by name or topic…"
            wrapperClassName="min-w-[220px] flex-1"
            aria-label="Search reading groups"
          />
          <Select
            placeholder="All statuses"
            options={GROUP_STATUSES}
            value={list.filters.status || ''}
            onChange={(e) => list.setFilter('status', e.target.value)}
            wrapperClassName="w-40"
            aria-label="Filter by status"
          />
          <Select
            placeholder="All departments"
            options={(departments?.items || []).map((d) => ({ value: d.id, label: d.name }))}
            value={list.filters.department || ''}
            onChange={(e) => list.setFilter('department', e.target.value)}
            wrapperClassName="w-52"
            aria-label="Filter by department"
          />
        </div>

        <DataTable
          columns={columns}
          rows={list.items}
          loading={list.isLoading}
          error={list.error}
          onRetry={list.refetch}
          emptyTitle="No reading groups"
          emptyDescription="Create a group to start scheduling study sessions."
          emptyAction={can(P.GROUP_MANAGE)
            ? <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}>Create Group</Button>
            : undefined}
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

      <GroupForm
        open={formOpen}
        group={editing}
        onClose={() => { setFormOpen(false); setEditing(null); }}
        onSaved={() => { setFormOpen(false); setEditing(null); list.refetch(); }}
      />

      <ConfirmDialog
        open={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        onConfirm={remove}
        loading={busy}
        title="Delete this reading group?"
        confirmLabel="Delete group"
        message={`"${toDelete?.name}" will be removed. Groups with scheduled sessions must have those cancelled first.`}
      />
    </>
  );
}
