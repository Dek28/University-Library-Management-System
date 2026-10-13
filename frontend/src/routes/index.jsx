import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router';
import AuthLayout from '../layouts/AuthLayout';
import DashboardLayout from '../layouts/DashboardLayout';
import {
  RequireAuth, RequireAnonymous, RequirePermission, RequireFines,
} from './guards';
import { PageLoader } from '../components/ui';
import { P } from '../constants';

/**
 * Route table.
 *
 * Pages are code-split so the initial bundle stays small; each subtree is
 * wrapped in the permission gate matching the API's own requirement, and
 * `handle.title` supplies the title shown in the top bar.
 */
const load = (factory) => {
  const Component = lazy(factory);
  return (
    <Suspense fallback={<PageLoader />}>
      <Component />
    </Suspense>
  );
};

// Auth
const Login = () => import('../pages/auth/Login');
const ForgotPassword = () => import('../pages/auth/ForgotPassword');
const ResetPassword = () => import('../pages/auth/ResetPassword');

// Core
const Dashboard = () => import('../pages/dashboard/index.jsx');
const Profile = () => import('../pages/profile/Profile');
const Notifications = () => import('../pages/notifications/Notifications');
const NotFound = () => import('../pages/NotFound');

// Catalogue
const CatalogList = () => import('../pages/catalog/CatalogList');
const ResourceDetails = () => import('../pages/catalog/ResourceDetails');
const ResourceForm = () => import('../pages/catalog/ResourceForm');
const AdvancedSearch = () => import('../pages/catalog/AdvancedSearch');
const CatalogImport = () => import('../pages/catalog/CatalogImport');

// Circulation
const BorrowBooks = () => import('../pages/circulation/BorrowBooks');
const ReturnBooks = () => import('../pages/circulation/ReturnBooks');
const LoanList = () => import('../pages/circulation/LoanList');
const LoanDetails = () => import('../pages/circulation/LoanDetails');
const Reservations = () => import('../pages/reservations/Reservations');

// Fines
const FineList = () => import('../pages/fines/FineList');
const FineDetails = () => import('../pages/fines/FineDetails');

// Digital repository
const DigitalLibrary = () => import('../pages/digital/DigitalLibrary');
const DigitalDetails = () => import('../pages/digital/DigitalDetails');
const DigitalReader = () => import('../pages/digital/DigitalReader');

// Inventory
const Inventory = () => import('../pages/inventory/Inventory');
const StockAudits = () => import('../pages/inventory/StockAudits');

// Book orders
const PurchaseOrders = () => import('../pages/orders/PurchaseOrders');
const OrderDetails = () => import('../pages/orders/OrderDetails');
const OrderForm = () => import('../pages/orders/OrderForm');

// Clearance
const ClearanceDesk = () => import('../pages/clearance/ClearanceDesk');
const MyClearance = () => import('../pages/clearance/MyClearance');

// Reading groups
const ReadingGroups = () => import('../pages/groups/ReadingGroups');
const GroupDetails = () => import('../pages/groups/GroupDetails');
const GroupSchedule = () => import('../pages/groups/GroupSchedule');

// Reports and administration
const Reports = () => import('../pages/reports/Reports');
const UserList = () => import('../pages/users/UserList');
const UserForm = () => import('../pages/users/UserForm');
const UserDetails = () => import('../pages/users/UserDetails');
const BulkImport = () => import('../pages/users/BulkImport');
const Settings = () => import('../pages/admin/Settings');
const Roles = () => import('../pages/admin/Roles');
const AuditLogs = () => import('../pages/admin/AuditLogs');
const ReferenceData = () => import('../pages/admin/ReferenceData');

// Loan list variants share one component with different presets.
const ownLoans = () => import('../pages/circulation/LoanList').then((module) => ({
  default: (props) => module.default({ ...props, ownOnly: true, title: 'My Borrowing' }),
}));
const ownFines = () => import('../pages/fines/FineList').then((module) => ({
  default: (props) => module.default({ ...props, ownOnly: true }),
}));
const ownReservations = () => import('../pages/reservations/Reservations').then((module) => ({
  default: (props) => module.default({ ...props, ownOnly: true }),
}));
const auditDetails = () => import('../pages/inventory/StockAudits').then((module) => ({
  default: module.AuditDetails,
}));

export const router = createBrowserRouter([
  {
    element: <RequireAnonymous />,
    children: [
      {
        element: <AuthLayout />,
        children: [
          { path: '/login', element: load(Login) },
          { path: '/forgot-password', element: load(ForgotPassword) },
          { path: '/reset-password', element: load(ResetPassword) },
        ],
      },
    ],
  },

  {
    element: <RequireAuth />,
    children: [
      {
        element: <DashboardLayout />,
        children: [
          { index: true, element: <Navigate to="/dashboard" replace /> },
          { path: '/dashboard', element: load(Dashboard), handle: { title: 'Dashboard' } },
          { path: '/profile', element: load(Profile), handle: { title: 'My Profile' } },
          { path: '/notifications', element: load(Notifications), handle: { title: 'Notifications' } },

          // ------------------------------------------------------- Catalogue
          {
            element: <RequirePermission anyOf={[P.RESOURCE_VIEW]} />,
            children: [
              { path: '/catalog', element: load(CatalogList), handle: { title: 'Catalog' } },
              { path: '/catalog/search', element: load(AdvancedSearch), handle: { title: 'Advanced Search' } },
              { path: '/catalog/:id', element: load(ResourceDetails), handle: { title: 'Book Details' } },
            ],
          },
          {
            element: <RequirePermission anyOf={[P.RESOURCE_CREATE]} />,
            children: [
              { path: '/catalog/new', element: load(ResourceForm), handle: { title: 'Add Book' } },
              { path: '/catalog/import', element: load(CatalogImport), handle: { title: 'Bulk import' } },
            ],
          },
          {
            element: <RequirePermission anyOf={[P.RESOURCE_UPDATE]} />,
            children: [{ path: '/catalog/:id/edit', element: load(ResourceForm), handle: { title: 'Edit Book' } }],
          },

          // ----------------------------------------------------- Circulation
          {
            element: <RequirePermission anyOf={[P.LOAN_ISSUE]} />,
            children: [{ path: '/circulation/borrow', element: load(BorrowBooks), handle: { title: 'Borrow Books' } }],
          },
          {
            element: <RequirePermission anyOf={[P.LOAN_RETURN]} />,
            children: [{ path: '/circulation/return', element: load(ReturnBooks), handle: { title: 'Return Books' } }],
          },
          {
            element: <RequirePermission anyOf={[P.LOAN_VIEW, P.LOAN_VIEW_OWN]} />,
            children: [
              { path: '/circulation', element: <Navigate to="/circulation/loans" replace /> },
              { path: '/circulation/loans', element: load(LoanList), handle: { title: 'Circulation' } },
              { path: '/circulation/loans/:id', element: load(LoanDetails), handle: { title: 'Loan' } },
            ],
          },
          {
            element: <RequirePermission anyOf={[P.RESERVATION_VIEW]} />,
            children: [
              { path: '/administration/reservations', element: load(Reservations), handle: { title: 'Reservations' } },
            ],
          },

          // ----------------------------------------------------------- Fines
          {
            element: <RequireFines />,
            children: [{
              element: <RequirePermission anyOf={[P.FINE_VIEW]} />,
              children: [
                { path: '/administration/fines', element: load(FineList), handle: { title: 'Fines Management' } },
                { path: '/administration/fines/:id', element: load(FineDetails), handle: { title: 'Fine' } },
              ],
            }],
          },

          // ---------------------------------------------- Digital repository
          {
            element: <RequirePermission anyOf={[P.DIGITAL_VIEW]} />,
            children: [
              { path: '/digital-library', element: load(DigitalLibrary), handle: { title: 'Digital Library' } },
              { path: '/digital-library/:id', element: load(DigitalDetails), handle: { title: 'Repository item' } },
              { path: '/digital-library/:id/read', element: load(DigitalReader), handle: { title: 'Read' } },
            ],
          },

          // ------------------------------------------------------- Inventory
          {
            element: <RequirePermission anyOf={[P.INVENTORY_VIEW]} />,
            children: [
              { path: '/inventory', element: load(Inventory), handle: { title: 'Inventory' } },
              { path: '/inventory/copies/:status', element: load(Inventory), handle: { title: 'Inventory' } },
              { path: '/inventory/audits', element: load(StockAudits), handle: { title: 'Stock verification' } },
              { path: '/inventory/audits/:id', element: load(auditDetails), handle: { title: 'Stock verification' } },
            ],
          },

          // ----------------------------------------------------- Book orders
          {
            element: <RequirePermission anyOf={[P.INVENTORY_VIEW]} />,
            children: [
              { path: '/orders', element: load(PurchaseOrders), handle: { title: 'Book Orders' } },
              { path: '/orders/:id', element: load(OrderDetails), handle: { title: 'Book Order' } },
            ],
          },
          {
            element: <RequirePermission anyOf={[P.INVENTORY_MANAGE]} />,
            children: [
              { path: '/orders/new', element: load(OrderForm), handle: { title: 'New Order' } },
              { path: '/orders/:id/edit', element: load(OrderForm), handle: { title: 'Edit Order' } },
            ],
          },

          // ------------------------------------------------------- Clearance
          {
            element: <RequirePermission anyOf={[P.CLEARANCE_VIEW]} />,
            children: [{ path: '/clearance', element: load(ClearanceDesk), handle: { title: 'Student Clearance' } }],
          },
          {
            element: <RequirePermission anyOf={[P.CLEARANCE_VIEW_OWN]} />,
            children: [{ path: '/my/clearance', element: load(MyClearance), handle: { title: 'My Clearance' } }],
          },

          // --------------------------------------------------- Reading groups
          {
            element: <RequirePermission anyOf={[P.GROUP_VIEW, P.GROUP_VIEW_OWN]} />,
            children: [
              { path: '/reading-groups', element: load(ReadingGroups), handle: { title: 'Student Groups' } },
              { path: '/reading-groups/schedule', element: load(GroupSchedule), handle: { title: 'Reading room schedule' } },
              { path: '/reading-groups/:id', element: load(GroupDetails), handle: { title: 'Reading group' } },
            ],
          },

          // --------------------------------------------------------- Reports
          {
            element: <RequirePermission anyOf={[P.REPORT_VIEW]} />,
            children: [{ path: '/reports', element: load(Reports), handle: { title: 'Reports & Analytics' } }],
          },

          // ----------------------------------------------------------- Users
          {
            element: <RequirePermission anyOf={[P.USER_VIEW]} />,
            children: [
              { path: '/users', element: load(UserList), handle: { title: 'User Management' } },
              { path: '/users/:id', element: load(UserDetails), handle: { title: 'Member' } },
            ],
          },
          {
            element: <RequirePermission anyOf={[P.USER_CREATE]} />,
            children: [{ path: '/users/new', element: load(UserForm), handle: { title: 'Add User' } }],
          },
          {
            element: <RequirePermission anyOf={[P.USER_UPDATE]} />,
            children: [{ path: '/users/:id/edit', element: load(UserForm), handle: { title: 'Edit member' } }],
          },
          {
            element: <RequirePermission anyOf={[P.USER_IMPORT]} />,
            children: [{ path: '/users/import', element: load(BulkImport), handle: { title: 'Bulk import' } }],
          },

          // -------------------------------------------------- Administration
          {
            element: <RequirePermission anyOf={[P.SETTING_VIEW]} />,
            children: [{ path: '/settings', element: load(Settings), handle: { title: 'Settings' } }],
          },
          {
            element: <RequirePermission anyOf={[P.REFERENCE_VIEW]} />,
            children: [{ path: '/administration/reference', element: load(ReferenceData), handle: { title: 'Reference data' } }],
          },
          {
            element: <RequirePermission anyOf={[P.ROLE_VIEW]} />,
            children: [{ path: '/administration/roles', element: load(Roles), handle: { title: 'Roles & Permissions' } }],
          },
          {
            element: <RequirePermission anyOf={[P.AUDIT_VIEW]} />,
            children: [{ path: '/administration/audit-logs', element: load(AuditLogs), handle: { title: 'Audit Logs' } }],
          },

          // ---------------------------------------------------- Member portal
          {
            element: <RequirePermission anyOf={[P.LOAN_VIEW_OWN]} />,
            children: [{ path: '/my/borrowing', element: load(ownLoans), handle: { title: 'My Borrowing' } }],
          },
          {
            element: <RequireFines />,
            children: [{
              element: <RequirePermission anyOf={[P.FINE_VIEW_OWN]} />,
              children: [{ path: '/my/fines', element: load(ownFines), handle: { title: 'My Fines' } }],
            }],
          },
          {
            element: <RequirePermission anyOf={[P.RESERVATION_CREATE_OWN]} />,
            children: [{ path: '/my/reservations', element: load(ownReservations), handle: { title: 'My Reservations' } }],
          },

          { path: '*', element: load(NotFound), handle: { title: 'Not found' } },
        ],
      },
    ],
  },
]);

export default router;
