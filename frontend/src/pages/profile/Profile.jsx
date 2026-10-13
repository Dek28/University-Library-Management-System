import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ShieldAlert } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  PageHeader, Card, Button, Input, PasswordInput, Select, Tabs, Avatar,
  DetailRow, StatusBadge, Badge, Barcode,
} from '../../components/ui';
import { userApi, authApi } from '../../api/endpoints';
import { useAuthStore } from '../../store/auth';
import useFinesEnabled from '../../hooks/useFinesEnabled';
import { changePasswordSchema } from '../../validators/schemas';
import { GENDERS } from '../../constants';
import { formatDate, formatDateTime, formatMoney, fullName, memberIdentifier, humanize } from '../../utils/format';

export default function Profile() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const permissions = useAuthStore((state) => state.permissions);
  const reloadProfile = useAuthStore((state) => state.reloadProfile);
  const logout = useAuthStore((state) => state.logout);
  const settings = useAuthStore((state) => state.settings);
  const symbol = settings?.locale?.currencySymbol || '$';
  const finesEnabled = useFinesEnabled();

  const [tab, setTab] = useState(params.get('tab') || 'profile');
  const [savingProfile, setSavingProfile] = useState(false);
  const [revoking, setRevoking] = useState(false);

  const profileForm = useForm({
    defaultValues: {
      phone: user?.phone || '',
      address: user?.address || '',
      gender: user?.gender || 'undisclosed',
    },
  });

  const passwordForm = useForm({ resolver: zodResolver(changePasswordSchema) });

  useEffect(() => {
    setParams(tab === 'profile' ? {} : { tab }, { replace: true });
  }, [tab]);

  useEffect(() => {
    if (!user) return;
    profileForm.reset({
      phone: user.phone || '',
      address: user.address || '',
      gender: user.gender || 'undisclosed',
    });
  }, [user]);

  const saveProfile = async (values) => {
    setSavingProfile(true);
    try {
      await userApi.updateOwnProfile(values);
      await reloadProfile();
      toast.success('Profile updated');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSavingProfile(false);
    }
  };

  const changePassword = async (values) => {
    try {
      await authApi.changePassword({ currentPassword: values.currentPassword, newPassword: values.newPassword });
      toast.success('Password changed. Please sign in again.');
      // Every session is revoked server-side, so return to the sign-in screen.
      await logout();
      navigate('/login', { replace: true });
    } catch (error) {
      toast.error(error.message);
    }
  };

  const revokeSessions = async () => {
    setRevoking(true);
    try {
      await authApi.revokeSessions();
      toast.success('All sessions revoked. Please sign in again.');
      await logout();
      navigate('/login', { replace: true });
    } catch (error) {
      toast.error(error.message);
    } finally {
      setRevoking(false);
    }
  };

  if (!user) return null;

  return (
    <>
      <PageHeader
        title="My Profile"
        breadcrumbs={[{ label: 'Profile' }]}
      />

      {user.mustChangePassword && tab !== 'security' && (
        <div className="mb-4 flex items-start gap-2.5 rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
          <div className="text-sm text-amber-800">
            <p className="font-medium">You are required to change your password.</p>
            <button type="button" onClick={() => setTab('security')} className="mt-0.5 font-medium underline">
              Change it now
            </button>
          </div>
        </div>
      )}

      <Tabs
        className="mb-4"
        tabs={[
          { key: 'profile', label: 'Profile' },
          { key: 'security', label: 'Security' },
          { key: 'access', label: 'Access' },
        ]}
        value={tab}
        onChange={setTab}
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-1">
          <div className="flex flex-col items-center text-center">
            <Avatar user={user} size="xl" />
            <p className="mt-3 text-md font-semibold text-slate-900">{fullName(user)}</p>
            <p className="text-xs text-slate-500">{memberIdentifier(user)}</p>
            <div className="mt-2 flex flex-wrap justify-center gap-1.5">
              <StatusBadge status={user.status} />
              <Badge tone="blue">{user.role?.name}</Badge>
            </div>
          </div>

          <dl className="mt-5 divide-y divide-line border-t border-line pt-2">
            <DetailRow label="Email">{user.email}</DetailRow>
            <DetailRow label="Faculty">{user.faculty?.name || '-'}</DetailRow>
            <DetailRow label="Department">{user.department?.name || '-'}</DetailRow>
            <DetailRow label="Program">{user.program?.name || '-'}</DetailRow>
            <DetailRow label="Active loans">{user.activeLoanCount || 0}</DetailRow>
            {finesEnabled && <DetailRow label="Outstanding fines">{formatMoney(user.outstandingFineTotal, symbol)}</DetailRow>}
            <DetailRow label="Clearance"><StatusBadge status={user.clearanceStatus} /></DetailRow>
            <DetailRow label="Last sign-in">{formatDateTime(user.lastLoginAt)}</DetailRow>
          </dl>

          {user.barcode && (
            <div className="mt-4 flex flex-col items-center border-t border-line pt-4">
              <p className="mb-1.5 text-xs text-slate-500">Library card</p>
              <Barcode value={user.barcode} height={40} />
            </div>
          )}
        </Card>

        <div className="xl:col-span-2">
          {tab === 'profile' && (
            <Card title="Editable details" subtitle="Ask the library to change anything not shown here.">
              <form onSubmit={profileForm.handleSubmit(saveProfile)} className="space-y-4" noValidate>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input label="Full name" value={fullName(user)} disabled />
                  <Input label="Email address" value={user.email} disabled />
                  <Input label="Phone" {...profileForm.register('phone')} />
                  <Select label="Gender" options={GENDERS} {...profileForm.register('gender')} />
                  <Input label="Department" value={user.department?.name || '-'} disabled />
                  <Input label="Role" value={user.role?.name || '-'} disabled />
                  <Input label="Address" wrapperClassName="sm:col-span-2" {...profileForm.register('address')} />
                </div>

                <div className="flex justify-end">
                  <Button type="submit" loading={savingProfile}>Update Profile</Button>
                </div>
              </form>
            </Card>
          )}

          {tab === 'security' && (
            <div className="space-y-4">
              <Card title="Change password">
                <form onSubmit={passwordForm.handleSubmit(changePassword)} className="space-y-4" noValidate>
                  <PasswordInput
                    label="Current password"
                    autoComplete="current-password"
                    required
                    error={passwordForm.formState.errors.currentPassword?.message}
                    {...passwordForm.register('currentPassword')}
                  />
                  <PasswordInput
                    label="New password"
                    autoComplete="new-password"
                    required
                    hint="At least 8 characters, with an uppercase letter, a lowercase letter and a number."
                    error={passwordForm.formState.errors.newPassword?.message}
                    {...passwordForm.register('newPassword')}
                  />
                  <PasswordInput
                    label="Confirm new password"
                    autoComplete="new-password"
                    required
                    error={passwordForm.formState.errors.confirmPassword?.message}
                    {...passwordForm.register('confirmPassword')}
                  />
                  <p className="text-xs text-slate-500">
                    Changing your password signs you out of every device.
                  </p>
                  <div className="flex justify-end">
                    <Button type="submit" loading={passwordForm.formState.isSubmitting}>
                      Change password
                    </Button>
                  </div>
                </form>
              </Card>

              <Card title="Active sessions">
                <p className="text-sm text-slate-600">
                  If you have signed in on a shared or lost device, revoke every session. You will need
                  to sign in again on this device too.
                </p>
                <div className="mt-4 flex justify-end">
                  <Button variant="danger" loading={revoking} onClick={revokeSessions}>
                    Revoke all sessions
                  </Button>
                </div>
              </Card>
            </div>
          )}

          {tab === 'access' && (
            <Card title="What your account can do" subtitle={`${permissions.length} permission(s) granted through the ${user.role?.name} role`}>
              <div className="grid gap-2 sm:grid-cols-2">
                {permissions.map((permission) => (
                  <div key={permission} className="flex items-center gap-2 rounded-md border border-line px-3 py-2">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-700">
                      {humanize(permission.split(':')[1])}
                    </span>
                    <code className="shrink-0 text-2xs text-slate-400">{permission}</code>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs text-slate-500">
                These permissions are granted by your role. Every one of them is enforced by the server
                on each request. The interface only uses them to hide actions you cannot take.
              </p>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
