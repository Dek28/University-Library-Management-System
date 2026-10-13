import { Navigate, Outlet, useLocation } from 'react-router';
import { ShieldOff } from 'lucide-react';
import { useAuthStore } from '../store/auth';
import useFinesEnabled from '../hooks/useFinesEnabled';
import { PageLoader, Button, PageHeader, Card } from '../components/ui';

/** Blocks a route until a session exists, remembering where the user was going. */
export function RequireAuth() {
  const status = useAuthStore((state) => state.status);
  const location = useLocation();

  if (status === 'loading') return <PageLoader label="Restoring your session…" />;
  if (status !== 'authenticated') return <Navigate to="/login" state={{ from: location }} replace />;
  return <Outlet />;
}

/** Sends an already-signed-in user away from the auth screens. */
export function RequireAnonymous() {
  const status = useAuthStore((state) => state.status);
  if (status === 'loading') return <PageLoader />;
  if (status === 'authenticated') return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}

function Forbidden() {
  return (
    <>
      <PageHeader title="Not available" breadcrumbs={[{ label: 'Access' }]} />
      <Card>
        <div className="flex flex-col items-center py-12 text-center">
          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-500">
            <ShieldOff className="h-6 w-6" aria-hidden="true" />
          </span>
          <p className="text-md font-semibold text-slate-900">You do not have access to this page</p>
          <p className="mt-1 max-w-md text-sm text-slate-500">
            Your role does not include the permission this page requires. If you believe this is wrong,
            contact a library administrator.
          </p>
          <Button as="a" href="/dashboard" className="mt-5">Back to dashboard</Button>
        </div>
      </Card>
    </>
  );
}

/**
 * Permission gate for a route subtree.
 *
 * `anyOf` passes when the account holds at least one permission; `allOf`
 * requires every one. This hides pages the user cannot use. The API enforces
 * the same rules independently on every request.
 */
export function RequirePermission({ anyOf = [], allOf = [] }) {
  const permissions = useAuthStore((state) => state.permissions);

  const hasAny = anyOf.length === 0 || anyOf.some((p) => permissions.includes(p));
  const hasAll = allOf.every((p) => permissions.includes(p));

  if (!hasAny || !hasAll) return <Forbidden />;
  return <Outlet />;
}

/**
 * Fines pages while the library has fines turned off: old bookmarks and
 * links in earlier notifications land on the dashboard instead.
 */
export function RequireFines() {
  if (!useFinesEnabled()) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
