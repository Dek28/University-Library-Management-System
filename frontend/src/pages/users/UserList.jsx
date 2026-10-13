import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Eye, Pencil, Trash2, ShieldOff, ShieldCheck, KeyRound } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  PageHeader, Card, DataTable, Pagination, Button, IconButton, SearchInput,
  Select, StatusBadge, ConfirmDialog, Avatar, Modal, Input,
} from '../../components/ui';
import { userApi, adminApi, referenceApi } from '../../api/endpoints';
import useListQuery from '../../hooks/useListQuery';
import { useAuthStore } from '../../store/auth';
import useFinesEnabled from '../../hooks/useFinesEnabled';
import { P, USER_STATUSES } from '../../constants';
import { formatDate, formatMoney, fullName, memberIdentifier } from '../../utils/format';

/** Suspend / reactivate / archive an account, with a reason for the audit trail. */
function StatusDialog({ user, open, onClose, onSaved }) {
  const [status, setStatus] = useState('suspended');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await userApi.changeStatus(user.id, { status, reason });
      toast.success(`Account marked ${status}`);
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
      title="Change account status"
      description={user ? fullName(user) : ''}
      size="sm"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={busy}>Apply</Button>
        </>
      )}
    >
      <div className="space-y-4">
        <Select label="New status" options={USER_STATUSES} value={status} onChange={(e) => setStatus(e.target.value)} />
        <Input label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Recorded in the audit trail" />
        <p className="text-xs text-slate-500">
          Suspending an account revokes its sessions immediately. Archiving is refused while the member
          still has items on loan.
        </p>
      </div>
    </Modal>
  );
}

/** Administrator-initiated password reset. */
function ResetPasswordDialog({ user, open, onClose }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await userApi.resetPassword(user.id, { newPassword: password });
      toast.success('Password reset. The member must change it at next sign-in.');
      onClose();
      setPassword('');
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
      title="Reset this member's password"
      description={user ? fullName(user) : ''}
      size="sm"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={busy} disabled={password.length < 8}>Reset password</Button>
        </>
      )}
    >
      <Input
        label="Temporary password"
        type="text"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        hint="At least 8 characters with upper case, lower case and a number. All sessions are revoked and the member must change it at next sign-in."
      />
    </Modal>
  );
}

export default function UserList() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const can = useAuthStore((state) => state.can);
  const settings = useAuthStore((state) => state.settings);
  const symbol = settings?.locale?.currencySymbol || '$';
  const finesEnabled = useFinesEnabled();

  const [showFilters, setShowFilters] = useState(false);
  const [statusTarget, setStatusTarget] = useState(null);
  const [resetTarget, setResetTarget] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [busy, setBusy] = useState(false);

  const list = useListQuery({
    queryKey: ['users'],
    queryFn: userApi.list,
    initialFilters: {
      roleKey: params.get('roleKey') || '',
      status: '',
      department: '',
    },
  });

  const { data: roles } = useQuery({ queryKey: ['roles'], queryFn: adminApi.roles, staleTime: 10 * 60_000 });
  const { data: departments } = useQuery({
    queryKey: ['reference', 'departments', 'options'],
    queryFn: () => referenceApi.list('departments', { limit: 200 }),
    staleTime: 5 * 60_000,
  });

  const remove = async () => {
    setBusy(true);
    try {
      await userApi.remove(toDelete.id);
      toast.success('Account deleted');
      setToDelete(null);
      list.refetch();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  const exportAs = async (format) => {
    try {
      await userApi.export(list.params, format);
      toast.success(`Exported as ${format.toUpperCase()}`);
    } catch (error) {
      toast.error(error.message);
    }
  };

  const columns = [
    {
      key: 'name',
      header: 'Name',
      primary: true,
      render: (row) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar user={row} size="sm" />
          <div className="min-w-0">
            <Link to={`/users/${row.id}`} className="block truncate font-medium text-slate-800 hover:text-brand-600">
              {fullName(row)}
            </Link>
            <p className="truncate text-xs text-slate-500">{memberIdentifier(row)}</p>
          </div>
        </div>
      ),
    },
    { key: 'email', header: 'Email', render: (row) => <span className="truncate">{row.email}</span> },
    { key: 'role', header: 'Role', render: (row) => row.role?.name || '-' },
    { key: 'department', hideWhenEmpty: true, header: 'Department', hideOnMobile: true, render: (row) => row.department?.name || '-' },
    { key: 'activeLoanCount', header: 'Loans', align: 'center', hideOnMobile: true },
    finesEnabled && {
      key: 'outstandingFineTotal',
      header: 'Fines',
      align: 'right',
      hideOnMobile: true,
      render: (row) => (row.outstandingFineTotal > 0
        ? <span className="font-medium text-red-600">{formatMoney(row.outstandingFineTotal, symbol)}</span>
        : <span className="text-slate-400">-</span>),
    },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <div className="flex justify-end gap-0.5">
          <IconButton icon={Eye} label="View member" onClick={() => navigate(`/users/${row.id}`)} />
          {can(P.USER_UPDATE) && (
            <IconButton icon={Pencil} label="Edit member" tone="success" onClick={() => navigate(`/users/${row.id}/edit`)} />
          )}
          {can(P.USER_STATUS) && (
            <>
              <IconButton icon={KeyRound} label="Reset password" tone="muted" onClick={() => setResetTarget(row)} />
              <IconButton
                icon={row.status === 'suspended' ? ShieldCheck : ShieldOff}
                label="Change status"
                tone={row.status === 'suspended' ? 'success' : 'muted'}
                onClick={() => setStatusTarget(row)}
              />
              <IconButton icon={Trash2} label="Delete member" tone="danger" onClick={() => setToDelete(row)} />
            </>
          )}
        </div>
      ),
    },
  ].filter(Boolean);

  return (
    <>
      <PageHeader
        title="User Management"
        breadcrumbs={[{ label: 'Users' }]}
        actions={(
          <>
            {can(P.USER_EXPORT) && <Button variant="secondary" onClick={() => exportAs('xlsx')}>Export</Button>}
            {can(P.USER_IMPORT) && <Button as={Link} to="/users/import" variant="secondary">Import</Button>}
            {can(P.USER_CREATE) && <Button as={Link} to="/users/new">Add User</Button>}
          </>
        )}
      />

      <Card noPadding>
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3.5">
          <SearchInput
            value={list.search}
            onChange={(e) => list.onSearchChange(e.target.value)}
            placeholder="Search by name, email, registration or staff number…"
            wrapperClassName="min-w-[240px] flex-1"
            aria-label="Search members"
          />
          <Button variant="secondary" onClick={() => setShowFilters((v) => !v)}>
            Filters{list.activeFilterCount > 0 && ` (${list.activeFilterCount})`}
          </Button>
        </div>

        {showFilters && (
          <div className="grid gap-3 border-b border-line bg-slate-50/60 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
            <Select
              label="Role"
              placeholder="All roles"
              options={(roles || []).map((role) => ({ value: role.key, label: role.name }))}
              value={list.filters.roleKey || ''}
              onChange={(e) => list.setFilter('roleKey', e.target.value)}
            />
            <Select
              label="Status"
              placeholder="All statuses"
              options={USER_STATUSES}
              value={list.filters.status || ''}
              onChange={(e) => list.setFilter('status', e.target.value)}
            />
            <Select
              label="Department"
              placeholder="All departments"
              options={(departments?.items || []).map((d) => ({ value: d.id, label: d.name }))}
              value={list.filters.department || ''}
              onChange={(e) => list.setFilter('department', e.target.value)}
            />
            <div className="flex items-end">
              <Button variant="ghost" size="sm" onClick={list.resetFilters}>Clear filters</Button>
            </div>
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
          emptyTitle="No members found"
          emptyDescription="Try a different search term or clear the filters."
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

      <StatusDialog
        user={statusTarget}
        open={Boolean(statusTarget)}
        onClose={() => setStatusTarget(null)}
        onSaved={list.refetch}
      />

      <ResetPasswordDialog
        user={resetTarget}
        open={Boolean(resetTarget)}
        onClose={() => setResetTarget(null)}
      />

      <ConfirmDialog
        open={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        onConfirm={remove}
        loading={busy}
        title="Delete this account?"
        confirmLabel="Delete account"
        message={`${fullName(toDelete)} will be removed. Deletion is refused while the member has open loans${finesEnabled ? ' or unpaid fines' : ''}. Archive the account instead.`}
      />
    </>
  );
}
