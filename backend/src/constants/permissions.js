/**
 * Central permission registry.
 * Permissions are plain strings in the form `<domain>:<action>` so new domains
 * can be added without touching the authorization middleware.
 */
const P = {
  // Users & accounts
  USER_VIEW: 'user:view',
  USER_CREATE: 'user:create',
  USER_UPDATE: 'user:update',
  USER_STATUS: 'user:status',
  USER_IMPORT: 'user:import',
  USER_EXPORT: 'user:export',

  // Roles / permissions
  ROLE_VIEW: 'role:view',
  ROLE_MANAGE: 'role:manage',

  // Reference data (faculties, departments, programs, categories, ...)
  REFERENCE_VIEW: 'reference:view',
  REFERENCE_MANAGE: 'reference:manage',

  // Catalog
  RESOURCE_VIEW: 'resource:view',
  RESOURCE_CREATE: 'resource:create',
  RESOURCE_UPDATE: 'resource:update',
  RESOURCE_DELETE: 'resource:delete',
  COPY_MANAGE: 'copy:manage',

  // Circulation
  LOAN_VIEW: 'loan:view',
  LOAN_VIEW_OWN: 'loan:view_own',
  LOAN_ISSUE: 'loan:issue',
  LOAN_RETURN: 'loan:return',
  LOAN_RENEW: 'loan:renew',
  LOAN_RENEW_OWN: 'loan:renew_own',
  LOAN_MARK_LOST: 'loan:mark_lost',

  // Reservations
  RESERVATION_VIEW: 'reservation:view',
  RESERVATION_MANAGE: 'reservation:manage',
  RESERVATION_CREATE_OWN: 'reservation:create_own',

  // Fines
  FINE_VIEW: 'fine:view',
  FINE_VIEW_OWN: 'fine:view_own',
  FINE_CREATE: 'fine:create',
  FINE_PAY: 'fine:pay',
  FINE_WAIVE: 'fine:waive',

  // Digital repository
  DIGITAL_VIEW: 'digital:view',
  DIGITAL_UPLOAD: 'digital:upload',
  DIGITAL_MANAGE: 'digital:manage',

  // Inventory
  INVENTORY_VIEW: 'inventory:view',
  INVENTORY_MANAGE: 'inventory:manage',

  // Clearance
  CLEARANCE_VIEW: 'clearance:view',
  CLEARANCE_VIEW_OWN: 'clearance:view_own',
  CLEARANCE_REQUEST_OWN: 'clearance:request_own',
  CLEARANCE_PROCESS: 'clearance:process',
  CLEARANCE_OVERRIDE: 'clearance:override',

  // Reading groups
  GROUP_VIEW: 'group:view',
  GROUP_VIEW_OWN: 'group:view_own',
  GROUP_MANAGE: 'group:manage',
  GROUP_ATTENDANCE: 'group:attendance',

  // Reports & analytics
  REPORT_VIEW: 'report:view',
  DASHBOARD_ADMIN: 'dashboard:admin',
  DASHBOARD_LIBRARIAN: 'dashboard:librarian',
  DASHBOARD_SELF: 'dashboard:self',

  // System
  SETTING_VIEW: 'setting:view',
  SETTING_MANAGE: 'setting:manage',
  AUDIT_VIEW: 'audit:view',
  NOTIFICATION_BROADCAST: 'notification:broadcast',
};

const ALL_PERMISSIONS = Object.values(P);

const ROLE_KEYS = {
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  LIBRARIAN: 'librarian',
  LECTURER: 'lecturer',
  STUDENT: 'student',
};

/** Permissions granted to every authenticated account. */
const BASE_MEMBER_PERMISSIONS = [
  P.RESOURCE_VIEW,
  P.LOAN_VIEW_OWN,
  P.LOAN_RENEW_OWN,
  P.RESERVATION_CREATE_OWN,
  P.FINE_VIEW_OWN,
  P.DIGITAL_VIEW,
  P.DASHBOARD_SELF,
  P.REFERENCE_VIEW,
];

const ROLE_PERMISSIONS = {
  [ROLE_KEYS.SUPER_ADMIN]: ALL_PERMISSIONS,

  [ROLE_KEYS.ADMIN]: [
    ...BASE_MEMBER_PERMISSIONS,
    P.USER_VIEW, P.USER_CREATE, P.USER_UPDATE, P.USER_STATUS, P.USER_IMPORT, P.USER_EXPORT,
    P.ROLE_VIEW,
    P.REFERENCE_MANAGE,
    P.RESOURCE_CREATE, P.RESOURCE_UPDATE, P.COPY_MANAGE,
    P.LOAN_VIEW,
    P.RESERVATION_VIEW, P.RESERVATION_MANAGE,
    P.FINE_VIEW, P.FINE_PAY, P.FINE_WAIVE,
    P.DIGITAL_UPLOAD, P.DIGITAL_MANAGE,
    P.INVENTORY_VIEW, P.INVENTORY_MANAGE,
    P.CLEARANCE_VIEW, P.CLEARANCE_PROCESS,
    P.GROUP_VIEW, P.GROUP_MANAGE, P.GROUP_ATTENDANCE,
    P.REPORT_VIEW, P.DASHBOARD_ADMIN, P.DASHBOARD_LIBRARIAN,
    P.SETTING_VIEW, P.AUDIT_VIEW, P.NOTIFICATION_BROADCAST,
  ],

  [ROLE_KEYS.LIBRARIAN]: [
    ...BASE_MEMBER_PERMISSIONS,
    P.USER_VIEW,
    P.RESOURCE_CREATE, P.RESOURCE_UPDATE, P.COPY_MANAGE,
    P.LOAN_VIEW, P.LOAN_ISSUE, P.LOAN_RETURN, P.LOAN_RENEW, P.LOAN_MARK_LOST,
    P.RESERVATION_VIEW, P.RESERVATION_MANAGE,
    P.FINE_VIEW, P.FINE_CREATE, P.FINE_PAY,
    P.DIGITAL_UPLOAD, P.DIGITAL_MANAGE,
    P.INVENTORY_VIEW, P.INVENTORY_MANAGE,
    P.CLEARANCE_VIEW, P.CLEARANCE_PROCESS,
    P.GROUP_VIEW, P.GROUP_MANAGE, P.GROUP_ATTENDANCE,
    P.REPORT_VIEW, P.DASHBOARD_LIBRARIAN,
    P.SETTING_VIEW,
  ],

  [ROLE_KEYS.LECTURER]: [
    ...BASE_MEMBER_PERMISSIONS,
    P.DIGITAL_UPLOAD,
    P.GROUP_VIEW_OWN,
    P.CLEARANCE_VIEW_OWN,
  ],

  [ROLE_KEYS.STUDENT]: [
    ...BASE_MEMBER_PERMISSIONS,
    P.CLEARANCE_VIEW_OWN,
    P.CLEARANCE_REQUEST_OWN,
    P.GROUP_VIEW_OWN,
  ],
};

const ROLE_DEFINITIONS = [
  { key: ROLE_KEYS.SUPER_ADMIN, name: 'Super Administrator', level: 100, description: 'Unrestricted system access' },
  { key: ROLE_KEYS.ADMIN, name: 'Administrator', level: 80, description: 'Administrative and reporting access' },
  { key: ROLE_KEYS.LIBRARIAN, name: 'Librarian', level: 60, description: 'Day-to-day library operations' },
  { key: ROLE_KEYS.LECTURER, name: 'Academic Staff', level: 30, description: 'Academic staff borrower' },
  { key: ROLE_KEYS.STUDENT, name: 'Student', level: 10, description: 'Student borrower' },
].map((r) => ({ ...r, permissions: [...new Set(ROLE_PERMISSIONS[r.key])] }));

module.exports = { P, PERMISSIONS: P, ALL_PERMISSIONS, ROLE_KEYS, ROLE_PERMISSIONS, ROLE_DEFINITIONS };
