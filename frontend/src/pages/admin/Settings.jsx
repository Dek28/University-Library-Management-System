import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Save, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  PageHeader, Card, Button, Input, Select, Checkbox, Tabs, PageLoader, ErrorState, Avatar,
} from '../../components/ui';
import { adminApi } from '../../api/endpoints';
import { useAuthStore } from '../../store/auth';
import { P } from '../../constants';

const DAYS = [
  { key: 'mon', label: 'Monday' }, { key: 'tue', label: 'Tuesday' }, { key: 'wed', label: 'Wednesday' },
  { key: 'thu', label: 'Thursday' }, { key: 'fri', label: 'Friday' }, { key: 'sat', label: 'Saturday' },
  { key: 'sun', label: 'Sunday' },
];

/**
 * System configuration.
 *
 * Borrowing rules and fine policies live here rather than in code, so a policy
 * change takes effect on the next transaction without a deployment.
 */
/** Tabs that are a wide table rather than a form. */
const TABLE_TABS = ['borrowing', 'fines'];

export default function Settings() {
  const can = useAuthStore((state) => state.can);
  const setSettings = useAuthStore((state) => state.setSettings);
  const editable = can(P.SETTING_MANAGE);

  const [tab, setTab] = useState('institution');
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['settings'],
    queryFn: adminApi.settings,
  });

  useEffect(() => { if (data) setDraft(structuredClone(data)); }, [data]);

  if (isLoading || !draft) return <PageLoader label="Loading settings…" />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;

  const patch = (path, value) => {
    setDraft((prev) => {
      const next = structuredClone(prev);
      const keys = path.split('.');
      let cursor = next;
      keys.slice(0, -1).forEach((key) => { cursor = cursor[key]; });
      cursor[keys[keys.length - 1]] = value;
      return next;
    });
  };

  const patchArray = (key, index, field, value) => {
    setDraft((prev) => {
      const next = structuredClone(prev);
      next[key][index][field] = value;
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      // Send only the editable sections; server-managed fields are ignored.
      const payload = {
        institution: draft.institution,
        academic: draft.academic,
        locale: draft.locale,
        borrowingRules: draft.borrowingRules,
        finePolicies: draft.finePolicies,
        circulation: draft.circulation,
        operatingHours: draft.operatingHours,
        uploads: { maxFileSizeMb: draft.uploads.maxFileSizeMb },
        security: draft.security,
      };
      const updated = await adminApi.updateSettings(payload);
      setSettings(updated);
      toast.success('Settings saved');
      refetch();
    } catch (err) {
      toast.error(err.message);
      (err.errors || []).forEach((fieldError) => toast.error(`${fieldError.field}: ${fieldError.message}`));
    } finally {
      setSaving(false);
    }
  };

  const uploadLogo = async (file) => {
    if (!file) return;
    try {
      const result = await adminApi.uploadLogo(file);
      toast.success('Logo updated');
      setSettings(result.settings);
      refetch();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const symbol = draft.locale?.currencySymbol || '$';
  // Follows the unsaved draft, so the fines tab and column react to the switch at once.
  const chargesFines = draft.circulation?.finesEnabled !== false;

  const tabs = [
    { key: 'institution', label: 'Institution' },
    { key: 'borrowing', label: 'Borrowing rules' },
    chargesFines && { key: 'fines', label: 'Fine policies' },
    { key: 'circulation', label: 'Circulation' },
    { key: 'hours', label: 'Opening hours' },
    { key: 'security', label: 'Security' },
  ].filter(Boolean);

  return (
    <>
      <PageHeader
        title="Settings"
        breadcrumbs={[{ label: 'Settings' }]}
        actions={editable && <Button loading={saving} onClick={save}>Save changes</Button>}
      />

      <Tabs className="mb-4" tabs={tabs} value={tab} onChange={setTab} />

      {/* Forms sit in a two-thirds column; the wide tables keep the full width. */}
      <div className={TABLE_TABS.includes(tab) ? 'w-full' : 'w-full lg:w-2/3'}>
        {tab === 'institution' && (
          <div className="space-y-4">
            <Card title="Institution">
              <div className="mb-5 flex items-center gap-4">
                <Avatar src={draft.institution.logoUrl} size="xl" alt="Institution logo" />
                {editable && (
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                    <Upload className="h-4 w-4" aria-hidden="true" /> Upload logo
                    <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => uploadLogo(e.target.files?.[0])} />
                  </label>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="University name" disabled={!editable} value={draft.institution.universityName || ''} onChange={(e) => patch('institution.universityName', e.target.value)} />
                <Input label="Library name" disabled={!editable} value={draft.institution.libraryName || ''} onChange={(e) => patch('institution.libraryName', e.target.value)} />
                <Input label="Contact email" disabled={!editable} value={draft.institution.email || ''} onChange={(e) => patch('institution.email', e.target.value)} />
                <Input label="Phone" disabled={!editable} value={draft.institution.phone || ''} onChange={(e) => patch('institution.phone', e.target.value)} />
                <Input label="Website" disabled={!editable} value={draft.institution.website || ''} onChange={(e) => patch('institution.website', e.target.value)} />
                <Input label="Address" disabled={!editable} value={draft.institution.address || ''} onChange={(e) => patch('institution.address', e.target.value)} />
              </div>
            </Card>

            <Card title="Academic session and locale">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <Input label="Current academic year" disabled={!editable} value={draft.academic.currentAcademicYear || ''} onChange={(e) => patch('academic.currentAcademicYear', e.target.value)} />
                <Select
                  label="Current semester"
                  disabled={!editable}
                  options={[1, 2, 3].map((n) => ({ value: n, label: `Semester ${n}` }))}
                  value={draft.academic.currentSemester}
                  onChange={(e) => patch('academic.currentSemester', Number(e.target.value))}
                />
                <Input label="Currency code" disabled={!editable} value={draft.locale.currency || ''} onChange={(e) => patch('locale.currency', e.target.value)} />
                <Input label="Currency symbol" disabled={!editable} value={draft.locale.currencySymbol || ''} onChange={(e) => patch('locale.currencySymbol', e.target.value)} />
                <Input
                  label="Timezone"
                  disabled={!editable}
                  value={draft.locale.timezone || ''}
                  onChange={(e) => patch('locale.timezone', e.target.value)}
                />
                <Input label="Maximum upload size (MB)" type="number" disabled={!editable} value={draft.uploads.maxFileSizeMb} onChange={(e) => patch('uploads.maxFileSizeMb', Number(e.target.value))} />
              </div>
            </Card>
          </div>
        )}

        {tab === 'borrowing' && (
          <Card title="Borrowing entitlements">
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Role</th>
                    <th className="text-right">Max items</th>
                    <th className="text-right">Loan period (days)</th>
                    <th className="text-right">Max renewals</th>
                    <th className="text-right">Renewal period (days)</th>
                    {chargesFines && <th className="text-right">Blocking fine ({symbol})</th>}
                  </tr>
                </thead>
                <tbody>
                  {(draft.borrowingRules || []).map((rule, index) => (
                    <tr key={rule.roleKey}>
                      <td className="font-medium capitalize text-slate-800">{rule.roleKey.replace('_', ' ')}</td>
                      {['maxBooks', 'loanPeriodDays', 'maxRenewals', 'renewalPeriodDays', ...(chargesFines ? ['blockingFineThreshold'] : [])].map((field) => (
                        <td key={field} className="text-right">
                          <input
                            type="number"
                            min={0}
                            step={field === 'blockingFineThreshold' ? '0.01' : '1'}
                            disabled={!editable}
                            value={rule[field] ?? 0}
                            onChange={(e) => patchArray('borrowingRules', index, field, Number(e.target.value))}
                            className="w-24 rounded-md border border-slate-300 px-2 py-1 text-right text-sm focus:border-brand-500 focus:outline-hidden focus:ring-2 focus:ring-brand-500/25 disabled:bg-slate-50"
                            aria-label={`${field} for ${rule.roleKey}`}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {tab === 'fines' && chargesFines && (
          <Card title="Fine policies">
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Resource type</th>
                    <th className="text-right">Per day</th>
                    <th className="text-right">Grace (days)</th>
                    <th className="text-right">Maximum</th>
                    <th className="text-right">Lost item</th>
                    <th className="text-right">Damaged</th>
                    <th className="text-right">Severely damaged</th>
                    <th className="text-right">Replacement ×</th>
                  </tr>
                </thead>
                <tbody>
                  {(draft.finePolicies || []).map((policy, index) => (
                    <tr key={policy.resourceType}>
                      <td className="font-medium capitalize text-slate-800">{policy.resourceType.replace('_', ' ')}</td>
                      {['overdueRatePerDay', 'gracePeriodDays', 'maxFineAmount', 'lostItemBaseFine', 'damagedItemFine', 'severelyDamagedFine', 'replacementMultiplier'].map((field) => (
                        <td key={field} className="text-right">
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            disabled={!editable}
                            value={policy[field] ?? 0}
                            onChange={(e) => patchArray('finePolicies', index, field, Number(e.target.value))}
                            className="w-24 rounded-md border border-slate-300 px-2 py-1 text-right text-sm focus:border-brand-500 focus:outline-hidden focus:ring-2 focus:ring-brand-500/25 disabled:bg-slate-50"
                            aria-label={`${field} for ${policy.resourceType}`}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {tab === 'circulation' && (
          <Card title="Circulation rules">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Reservation collection window (days)"
                type="number"
                disabled={!editable}
                value={draft.circulation.reservationExpiryDays}
                onChange={(e) => patch('circulation.reservationExpiryDays', Number(e.target.value))}
              />
              <Input
                label="Due-soon reminder (days before)"
                type="number"
                disabled={!editable}
                value={draft.circulation.dueSoonReminderDays}
                onChange={(e) => patch('circulation.dueSoonReminderDays', Number(e.target.value))}
              />
            </div>

            <div className="mt-5 space-y-3 border-t border-line pt-4">
              <Checkbox
                label="Charge fines"
                disabled={!editable}
                checked={chargesFines}
                onChange={(e) => patch('circulation.finesEnabled', e.target.checked)}
              />
              <Checkbox
                label="Block borrowing while an item is overdue"
                disabled={!editable}
                checked={draft.circulation.blockBorrowingWhenOverdue}
                onChange={(e) => patch('circulation.blockBorrowingWhenOverdue', e.target.checked)}
              />
              <Checkbox
                label="Block renewal when another member is waiting"
                disabled={!editable}
                checked={draft.circulation.blockRenewalWhenReserved}
                onChange={(e) => patch('circulation.blockRenewalWhenReserved', e.target.checked)}
              />
              <Checkbox
                label="Allow self-service renewal"
                disabled={!editable}
                checked={draft.circulation.allowSelfRenewal}
                onChange={(e) => patch('circulation.allowSelfRenewal', e.target.checked)}
              />
            </div>
          </Card>
        )}

        {tab === 'hours' && (
          <Card title="Opening hours">
            <ul className="divide-y divide-line">
              {DAYS.map((day) => {
                const index = (draft.operatingHours || []).findIndex((entry) => entry.day === day.key);
                const entry = draft.operatingHours?.[index] || { opensAt: '08:00', closesAt: '20:00', isClosed: false };
                return (
                  <li key={day.key} className="flex flex-wrap items-center gap-4 py-3">
                    <span className="w-28 text-sm font-medium text-slate-700">{day.label}</span>
                    <Checkbox
                      label="Closed"
                      disabled={!editable}
                      checked={entry.isClosed}
                      onChange={(e) => patchArray('operatingHours', index, 'isClosed', e.target.checked)}
                    />
                    {!entry.isClosed && (
                      <>
                        <input
                          type="time"
                          disabled={!editable}
                          value={entry.opensAt}
                          onChange={(e) => patchArray('operatingHours', index, 'opensAt', e.target.value)}
                          className="rounded-md border border-slate-300 px-2 py-1 text-sm disabled:bg-slate-50"
                          aria-label={`${day.label} opening time`}
                        />
                        <span className="text-slate-400">to</span>
                        <input
                          type="time"
                          disabled={!editable}
                          value={entry.closesAt}
                          onChange={(e) => patchArray('operatingHours', index, 'closesAt', e.target.value)}
                          className="rounded-md border border-slate-300 px-2 py-1 text-sm disabled:bg-slate-50"
                          aria-label={`${day.label} closing time`}
                        />
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        )}

        {tab === 'security' && (
          <Card title="Account security">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <Input
                label="Minimum password length"
                type="number"
                min={8}
                disabled={!editable}
                value={draft.security.passwordMinLength}
                onChange={(e) => patch('security.passwordMinLength', Number(e.target.value))}
              />
              <Input
                label="Password expiry (days)"
                type="number"
                min={0}
                disabled={!editable}
                value={draft.security.passwordExpiryDays}
                onChange={(e) => patch('security.passwordExpiryDays', Number(e.target.value))}
                hint="0 disables expiry."
              />
              <Input
                label="Failed sign-ins before lockout"
                type="number"
                min={1}
                disabled={!editable}
                value={draft.security.maxFailedLogins}
                onChange={(e) => patch('security.maxFailedLogins', Number(e.target.value))}
              />
            </div>
          </Card>
        )}

        {editable && (
          <div className="mt-4 flex justify-end">
            <Button loading={saving} onClick={save}>Save changes</Button>
          </div>
        )}
      </div>
    </>
  );
}
