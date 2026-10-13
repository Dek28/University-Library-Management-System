import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ShieldCheck, Save, Lock } from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import {
  PageHeader, Card, Button, Badge, PageLoader, ErrorState, Checkbox,
} from '../../components/ui';
import { adminApi } from '../../api/endpoints';
import { useAuthStore } from '../../store/auth';
import { P } from '../../constants';
import { humanize } from '../../utils/format';

const DOMAIN_LABELS = {
  user: 'Members', role: 'Roles', reference: 'Reference data', resource: 'Catalogue',
  copy: 'Copies', loan: 'Circulation', reservation: 'Reservations', fine: 'Fines',
  digital: 'Digital repository', inventory: 'Inventory', clearance: 'Clearance',
  group: 'Reading groups', report: 'Reports', dashboard: 'Dashboards',
  setting: 'Settings', audit: 'Audit log', notification: 'Notifications',
};

/**
 * Role and permission matrix.
 *
 * The UI mirrors the server's registry; the server still refuses any change
 * that would raise a role to or above the editor's own authority level.
 */
export default function Roles() {
  const can = useAuthStore((state) => state.can);
  const reloadProfile = useAuthStore((state) => state.reloadProfile);
  const editable = can(P.ROLE_MANAGE);

  const [selectedKey, setSelectedKey] = useState(null);
  const [draft, setDraft] = useState([]);
  const [saving, setSaving] = useState(false);

  const { data: roles, isLoading, error, refetch } = useQuery({ queryKey: ['roles'], queryFn: adminApi.roles });
  const { data: catalogue } = useQuery({
    queryKey: ['roles', 'permissions'],
    queryFn: adminApi.permissions,
    staleTime: 10 * 60_000,
  });

  const selected = (roles || []).find((role) => role.key === selectedKey) || (roles || [])[0];

  useEffect(() => {
    if (selected) setDraft(selected.permissions || []);
  }, [selected?.id]);

  if (isLoading) return <PageLoader label="Loading roles…" />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;

  const isProtected = selected?.key === 'super_admin';

  const toggle = (permission) => {
    setDraft((prev) => (prev.includes(permission) ? prev.filter((p) => p !== permission) : [...prev, permission]));
  };

  const toggleDomain = (permissions, enable) => {
    setDraft((prev) => (enable
      ? [...new Set([...prev, ...permissions])]
      : prev.filter((p) => !permissions.includes(p))));
  };

  const save = async () => {
    setSaving(true);
    try {
      await adminApi.updateRole(selected.id, { permissions: draft });
      toast.success(`${selected.name} permissions updated`);
      await refetch();
      // The signed-in account's own permissions may have just changed.
      await reloadProfile().catch(() => {});
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const grouped = catalogue?.grouped || {};
  const dirty = selected && JSON.stringify([...draft].sort()) !== JSON.stringify([...(selected.permissions || [])].sort());

  return (
    <>
      <PageHeader
        title="Roles & Permissions"
        breadcrumbs={[{ label: 'Administration' }, { label: 'Roles' }]}
        actions={editable && !isProtected && (
          <Button loading={saving} disabled={!dirty} onClick={save}>Save permissions</Button>
        )}
      />

      <div className="grid gap-4 lg:grid-cols-4">
        <Card title="Roles" noPadding className="lg:col-span-1">
          <ul className="divide-y divide-line">
            {(roles || []).map((role) => (
              <li key={role.id}>
                <button
                  type="button"
                  onClick={() => setSelectedKey(role.key)}
                  className={clsx(
                    'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors',
                    selected?.id === role.id ? 'bg-brand-50' : 'hover:bg-slate-50',
                  )}
                >
                  <span className={clsx(
                    'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                    selected?.id === role.id ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500',
                  )}
                  >
                    <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-800">{role.name}</span>
                    <span className="block text-2xs text-slate-500">
                      level {role.level} · {(role.permissions || []).length} permission(s)
                    </span>
                  </span>
                  {role.key === 'super_admin' && <Lock className="mt-1 h-3.5 w-3.5 text-slate-400" aria-hidden="true" />}
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <Card
          className="lg:col-span-3"
          title={selected ? `${selected.name} permissions` : 'Permissions'}
          subtitle={selected?.description}
          actions={(
            <div className="flex items-center gap-2">
              <Badge tone="slate">{draft.length} granted</Badge>
              {isProtected && <Badge tone="amber">Immutable</Badge>}
            </div>
          )}
        >
          {isProtected && (
            <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">
              The super administrator role always holds every permission and cannot be edited.
            </p>
          )}

          <div className="space-y-5">
            {Object.entries(grouped).map(([domain, permissions]) => {
              const allOn = permissions.every((permission) => draft.includes(permission));
              return (
                <div key={domain}>
                  <div className="mb-2 flex items-center justify-between border-b border-line pb-1.5">
                    <h3 className="text-sm font-semibold text-slate-800">{DOMAIN_LABELS[domain] || humanize(domain)}</h3>
                    {editable && !isProtected && (
                      <button
                        type="button"
                        onClick={() => toggleDomain(permissions, !allOn)}
                        className="text-xs font-medium text-brand-600 hover:underline"
                      >
                        {allOn ? 'Clear all' : 'Select all'}
                      </button>
                    )}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {permissions.map((permission) => (
                      <Checkbox
                        key={permission}
                        label={humanize(permission.split(':')[1])}
                        disabled={!editable || isProtected}
                        checked={draft.includes(permission)}
                        onChange={() => toggle(permission)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {editable && !isProtected && (
            <div className="mt-6 flex justify-end gap-2 border-t border-line pt-4">
              <Button variant="secondary" onClick={() => setDraft(selected.permissions || [])} disabled={!dirty}>
                Discard changes
              </Button>
              <Button loading={saving} disabled={!dirty} onClick={save}>Save permissions</Button>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
