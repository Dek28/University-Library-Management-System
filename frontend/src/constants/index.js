/** Mirrors the backend permission registry; used to gate UI affordances only. */
export const P = {
  USER_VIEW: 'user:view',
  USER_CREATE: 'user:create',
  USER_UPDATE: 'user:update',
  USER_STATUS: 'user:status',
  USER_IMPORT: 'user:import',
  USER_EXPORT: 'user:export',
  ROLE_VIEW: 'role:view',
  ROLE_MANAGE: 'role:manage',
  REFERENCE_VIEW: 'reference:view',
  REFERENCE_MANAGE: 'reference:manage',
  RESOURCE_VIEW: 'resource:view',
  RESOURCE_CREATE: 'resource:create',
  RESOURCE_UPDATE: 'resource:update',
  RESOURCE_DELETE: 'resource:delete',
  COPY_MANAGE: 'copy:manage',
  LOAN_VIEW: 'loan:view',
  LOAN_VIEW_OWN: 'loan:view_own',
  LOAN_ISSUE: 'loan:issue',
  LOAN_RETURN: 'loan:return',
  LOAN_RENEW: 'loan:renew',
  LOAN_RENEW_OWN: 'loan:renew_own',
  LOAN_MARK_LOST: 'loan:mark_lost',
  RESERVATION_VIEW: 'reservation:view',
  RESERVATION_MANAGE: 'reservation:manage',
  RESERVATION_CREATE_OWN: 'reservation:create_own',
  FINE_VIEW: 'fine:view',
  FINE_VIEW_OWN: 'fine:view_own',
  FINE_CREATE: 'fine:create',
  FINE_PAY: 'fine:pay',
  FINE_WAIVE: 'fine:waive',
  DIGITAL_VIEW: 'digital:view',
  DIGITAL_UPLOAD: 'digital:upload',
  DIGITAL_MANAGE: 'digital:manage',
  INVENTORY_VIEW: 'inventory:view',
  INVENTORY_MANAGE: 'inventory:manage',
  CLEARANCE_VIEW: 'clearance:view',
  CLEARANCE_VIEW_OWN: 'clearance:view_own',
  CLEARANCE_REQUEST_OWN: 'clearance:request_own',
  CLEARANCE_PROCESS: 'clearance:process',
  CLEARANCE_OVERRIDE: 'clearance:override',
  GROUP_VIEW: 'group:view',
  GROUP_VIEW_OWN: 'group:view_own',
  GROUP_MANAGE: 'group:manage',
  GROUP_ATTENDANCE: 'group:attendance',
  REPORT_VIEW: 'report:view',
  DASHBOARD_ADMIN: 'dashboard:admin',
  DASHBOARD_LIBRARIAN: 'dashboard:librarian',
  DASHBOARD_SELF: 'dashboard:self',
  SETTING_VIEW: 'setting:view',
  SETTING_MANAGE: 'setting:manage',
  AUDIT_VIEW: 'audit:view',
  NOTIFICATION_BROADCAST: 'notification:broadcast',
};

export const RESOURCE_TYPES = [
  { value: 'book', label: 'Book' },
  { value: 'journal', label: 'Journal' },
  { value: 'thesis', label: 'Thesis' },
  { value: 'dissertation', label: 'Dissertation' },
  { value: 'research_paper', label: 'Research paper' },
  { value: 'ebook', label: 'E-book' },
  { value: 'lecture_notes', label: 'Lecture notes' },
  { value: 'report', label: 'Report' },
  { value: 'reference', label: 'Reference material' },
  { value: 'newspaper', label: 'Newspaper' },
  { value: 'magazine', label: 'Magazine' },
  { value: 'institutional_publication', label: 'Institutional publication' },
  { value: 'conference_proceeding', label: 'Conference proceeding' },
  { value: 'other', label: 'Other' },
];

export const COPY_STATUSES = [
  { value: 'available', label: 'Available' },
  { value: 'borrowed', label: 'Borrowed' },
  { value: 'reserved', label: 'Reserved' },
  { value: 'damaged', label: 'Damaged' },
  { value: 'lost', label: 'Lost' },
  { value: 'missing', label: 'Missing' },
  { value: 'withdrawn', label: 'Withdrawn' },
  { value: 'under_repair', label: 'Under repair' },
  { value: 'reference_only', label: 'Reference only' },
];

export const COPY_CONDITIONS = [
  { value: 'excellent', label: 'Excellent' },
  { value: 'good', label: 'Good' },
  { value: 'fair', label: 'Fair' },
  { value: 'damaged', label: 'Damaged' },
  { value: 'severely_damaged', label: 'Severely damaged' },
  { value: 'lost', label: 'Lost' },
];

export const USER_STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'graduated', label: 'Graduated' },
  { value: 'withdrawn', label: 'Withdrawn' },
  { value: 'archived', label: 'Archived' },
];

export const ACCESS_LEVELS = [
  { value: 'public', label: 'Public (anyone)' },
  { value: 'university', label: 'University members only' },
  { value: 'students', label: 'Students only' },
  { value: 'staff', label: 'Academic staff only' },
  { value: 'librarians', label: 'Librarians and administrators' },
  { value: 'restricted', label: 'Restricted to administrators' },
];

export const FINE_TYPES = [
  { value: 'overdue', label: 'Overdue' },
  { value: 'lost', label: 'Lost item' },
  { value: 'damaged', label: 'Damaged item' },
  { value: 'replacement', label: 'Replacement' },
  { value: 'administrative', label: 'Administrative' },
];

export const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank', label: 'Bank transfer' },
  { value: 'mobile_money', label: 'Mobile money' },
  { value: 'card', label: 'Card' },
  { value: 'internal', label: 'Internal adjustment' },
];

/** How the library settles a supplier's invoice (distinct from fine payments). */
export const SUPPLIER_PAYMENT_METHODS = [
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'cash', label: 'Cash' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'card', label: 'Card' },
  { value: 'mobile_money', label: 'Mobile money' },
  { value: 'other', label: 'Other' },
];

export const ORDER_STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'ordered', label: 'Ordered' },
  { value: 'partially_received', label: 'Partially received' },
  { value: 'received', label: 'Received' },
  { value: 'cancelled', label: 'Cancelled' },
];

export const GROUP_STATUSES = [
  { value: 'planned', label: 'Planned' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export const GENDERS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
  { value: 'undisclosed', label: 'Prefer not to say' },
];

export const PAGE_SIZES = [10, 20, 50, 100];
