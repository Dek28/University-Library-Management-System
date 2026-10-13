import { useAuthStore } from '../../store/auth';
import { P } from '../../constants';
import AdminDashboard from './AdminDashboard';
import LibrarianDashboard from './LibrarianDashboard';
import MemberDashboard from './MemberDashboard';

/**
 * One route, three dashboards. The variant is chosen from the permissions the
 * API granted, so a role change is reflected without any client-side mapping.
 */
export default function Dashboard() {
  const permissions = useAuthStore((state) => state.permissions);

  if (permissions.includes(P.DASHBOARD_ADMIN)) return <AdminDashboard />;
  if (permissions.includes(P.DASHBOARD_LIBRARIAN)) return <LibrarianDashboard />;
  return <MemberDashboard />;
}
