
import { NavLink } from 'react-router';
import clsx from 'clsx';
import {
  LayoutDashboard,
  Library,
  RefreshCw,
  CloudDownload,
  Boxes,
  Users,
  BarChart3,
  GraduationCap,
  UsersRound,
  Settings,
  X,
  BookOpen,
  Bookmark,
  Receipt,
  ScrollText,
  ShieldCheck,
  Database,
  ShoppingCart,
} from 'lucide-react';

import { useAuthStore } from '../store/auth';
import { P } from '../constants';
import useFinesEnabled from '../hooks/useFinesEnabled';

/**
 * Staff and members get different menus. Staff links are grouped by the job
 * they serve; members get the library plus their own records. Items marked
 * `fines` only appear while the library charges fines.
 */
const NAV_SECTIONS = [
  {
    items: [{ to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }],
  },

  // ------------------------------------------------------------------ Staff
  {
    title: 'Catalogue',
    audience: 'staff',
    items: [
      { to: '/catalog', label: 'Catalog', icon: Library, any: [P.RESOURCE_VIEW] },
      { to: '/digital-library', label: 'Digital Library', icon: CloudDownload, any: [P.DIGITAL_VIEW] },
      { to: '/inventory', label: 'Inventory', icon: Boxes, any: [P.INVENTORY_VIEW] },
      { to: '/orders', label: 'Book Orders', icon: ShoppingCart, any: [P.INVENTORY_VIEW] },
    ],
  },
  {
    title: 'Circulation',
    audience: 'staff',
    items: [
      { to: '/circulation', label: 'Loans', icon: RefreshCw, any: [P.LOAN_VIEW] },
      { to: '/administration/reservations', label: 'Reservations', icon: Bookmark, any: [P.RESERVATION_VIEW] },
      { to: '/administration/fines', label: 'Fines', icon: Receipt, any: [P.FINE_VIEW], fines: true },
    ],
  },
  {
    title: 'Members',
    audience: 'staff',
    items: [
      { to: '/users', label: 'Users', icon: Users, any: [P.USER_VIEW] },
      { to: '/clearance', label: 'Clearance', icon: GraduationCap, any: [P.CLEARANCE_VIEW] },
      { to: '/reading-groups', label: 'Student Groups', icon: UsersRound, any: [P.GROUP_VIEW] },
    ],
  },
  {
    title: 'Administration',
    audience: 'staff',
    items: [
      { to: '/reports', label: 'Reports', icon: BarChart3, any: [P.REPORT_VIEW] },
      { to: '/settings', label: 'Settings', icon: Settings, any: [P.SETTING_VIEW] },
      { to: '/administration/roles', label: 'Roles & Permissions', icon: ShieldCheck, any: [P.ROLE_VIEW] },
      { to: '/administration/reference', label: 'Reference Data', icon: Database, any: [P.REFERENCE_VIEW] },
      { to: '/administration/audit-logs', label: 'Audit Logs', icon: ScrollText, any: [P.AUDIT_VIEW] },
    ],
  },

  // ---------------------------------------------------------------- Members
  {
    title: 'Library',
    audience: 'member',
    items: [
      { to: '/catalog', label: 'Catalog', icon: Library, any: [P.RESOURCE_VIEW] },
      { to: '/digital-library', label: 'Digital Library', icon: CloudDownload, any: [P.DIGITAL_VIEW] },
    ],
  },
  {
    title: 'My Library',
    audience: 'member',
    items: [
      { to: '/my/borrowing', label: 'My Borrowing', icon: BookOpen, any: [P.LOAN_VIEW_OWN] },
      { to: '/my/reservations', label: 'My Reservations', icon: Bookmark, any: [P.RESERVATION_CREATE_OWN] },
      { to: '/my/fines', label: 'My Fines', icon: Receipt, any: [P.FINE_VIEW_OWN], fines: true },
      { to: '/my/clearance', label: 'My Clearance', icon: GraduationCap, any: [P.CLEARANCE_VIEW_OWN] },
      { to: '/reading-groups', label: 'My Groups', icon: UsersRound, any: [P.GROUP_VIEW_OWN] },
    ],
  },
];
// Notifications are not listed: the bell in the top bar opens them.

export default function Sidebar({ open, onClose }) {
  const permissions = useAuthStore((state) => state.permissions);
  const settings = useAuthStore((state) => state.settings);
  const finesEnabled = useFinesEnabled();

  // Every account can *view* reference data (forms need it for their
  // dropdowns), so audience is decided by a staff-only permission instead.
  const audience = permissions.includes(P.USER_VIEW) ? 'staff' : 'member';

  const allowed = (item) => (!item.any || item.any.some((p) => permissions.includes(p)))
    && (!item.fines || finesEnabled);

  const sections = NAV_SECTIONS
    .filter((section) => !section.audience || section.audience === audience)
    .map((section) => ({ ...section, items: section.items.filter(allowed) }))
    .filter((section) => section.items.length > 0);
  return (
    <>
      {/* Mobile overlay */}
      <div
        className={clsx(
          'fixed inset-0 z-30 bg-black/50 transition-opacity duration-200 lg:hidden',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* BLUE SIDEBAR */}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-40 flex w-[252px] flex-col',
          'bg-blue-900 text-white!',
          'border-r border-blue-900',
          'shadow-xl',
          'transition-transform duration-200 ease-out',
          'lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-label="Main navigation"
      >
        {/* Header */}
        <div className="flex h-16 items-center justify-between border-b border-white/20 px-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15">
              <Library className="h-5 w-5 text-white" />
            </div>

            <div className="min-w-0">
              <h1 className="text-base font-bold text-white">
                ULMS
              </h1>

              <p className="truncate text-xs text-blue-200">
                {settings?.institution?.libraryName || 'University Library'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-blue-100 hover:bg-white/10 hover:text-white lg:hidden"
            aria-label="Close navigation"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <div className="space-y-6">
            {sections.map((section, index) => (
              <div key={section.title || index}>
                {section.title && (
                  <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-wider text-blue-300">
                    {section.title}
                  </p>
                )}

                <ul className="space-y-1">
                  {section.items.map((item) => (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        end={item.to === '/dashboard'}
                        onClick={onClose}
                        className={({ isActive }) =>
                          clsx(
                            'flex items-center gap-3 rounded-lg px-3 py-2.5',
                            'text-sm font-medium',
                            'transition-all duration-150',
                            isActive
                              ? 'bg-white! text-blue-800! shadow-xs'
                              : 'text-blue-100! hover:bg-blue-700! hover:text-white!',
                          )
                        }
                      >
                        {({ isActive }) => (
                          <>
                            <item.icon
                              className={clsx(
                                'h-[18px] w-[18px] shrink-0',
                                isActive
                                  ? 'text-blue-800'
                                  : 'text-blue-200',
                              )}
                            />

                            <span className="truncate">
                              {item.label}
                            </span>
                          </>
                        )}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </nav>

        {/* Footer */}
        <div className="border-t border-white/20 px-4 py-3">
          <p className="text-xs text-blue-300">
            ULMS v1.0
          </p>
        </div>
      </aside>
    </>
  );
}
