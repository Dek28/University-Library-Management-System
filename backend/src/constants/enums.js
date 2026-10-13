const USER_STATUS = ['active', 'inactive', 'suspended', 'graduated', 'withdrawn', 'archived'];

const RESOURCE_TYPES = [
  'book', 'journal', 'thesis', 'dissertation', 'research_paper', 'ebook',
  'lecture_notes', 'report', 'reference', 'newspaper', 'magazine',
  'institutional_publication', 'conference_proceeding', 'other',
];

const RESOURCE_STATUS = [
  'available', 'borrowed', 'reserved', 'damaged', 'lost',
  'under_maintenance', 'withdrawn', 'reference_only', 'digital_only',
];

const COPY_STATUS = [
  'available', 'borrowed', 'reserved', 'damaged', 'lost',
  'missing', 'withdrawn', 'under_repair', 'reference_only',
];

const COPY_CONDITION = ['excellent', 'good', 'fair', 'damaged', 'severely_damaged', 'lost'];

const LOAN_STATUS = ['active', 'returned', 'overdue', 'lost', 'damaged'];

const RESERVATION_STATUS = ['pending', 'ready', 'completed', 'cancelled', 'expired'];

const FINE_TYPES = ['overdue', 'lost', 'damaged', 'replacement', 'administrative'];

const FINE_STATUS = ['outstanding', 'partially_paid', 'paid', 'waived', 'cancelled'];

const ACCESS_LEVELS = ['public', 'university', 'students', 'staff', 'librarians', 'restricted'];

const CLEARANCE_STATUS = ['not_requested', 'pending', 'blocked', 'cleared', 'rejected'];

const GROUP_STATUS = ['planned', 'active', 'completed', 'cancelled'];

const ATTENDANCE_STATUS = ['present', 'absent', 'excused'];

const NOTIFICATION_TYPES = [
  'due_reminder', 'due_soon', 'overdue', 'fine_created', 'fine_paid',
  'reservation_ready', 'reservation_cancelled', 'reservation_expired',
  'digital_update', 'clearance_update', 'group_session', 'system',
];

const AUDIT_ACTIONS = [
  'login', 'logout', 'login_failed', 'password_changed', 'password_reset',
  'user_created', 'user_updated', 'user_status_changed', 'user_imported',
  'resource_created', 'resource_updated', 'resource_deleted', 'resource_imported',
  'copy_created', 'copy_updated', 'copy_deleted',
  'loan_issued', 'loan_returned', 'loan_renewed', 'loan_marked_lost',
  'reservation_created', 'reservation_cancelled', 'reservation_fulfilled',
  'fine_created', 'fine_paid', 'fine_waived', 'fine_adjusted',
  'clearance_requested', 'clearance_approved', 'clearance_rejected', 'clearance_override',
  'digital_uploaded', 'digital_updated', 'digital_deleted', 'digital_downloaded', 'digital_read',
  'inventory_audit_started', 'inventory_audit_completed', 'inventory_adjusted',
  'group_created', 'group_updated', 'group_session_created', 'group_attendance_recorded',
  'role_updated', 'settings_updated', 'reference_created', 'reference_updated', 'reference_deleted',
  'purchase_order_created', 'purchase_order_updated', 'purchase_order_placed',
  'purchase_order_received', 'purchase_order_cancelled', 'purchase_order_paid',
];

const INVENTORY_AUDIT_STATUS = ['in_progress', 'completed', 'cancelled'];

const PURCHASE_ORDER_STATUS = ['draft', 'ordered', 'partially_received', 'received', 'cancelled'];

const PAYMENT_STATUS = ['unpaid', 'paid'];

const PAYMENT_METHODS = ['cash', 'bank_transfer', 'cheque', 'card', 'mobile_money', 'other'];

const GENDERS = ['male', 'female', 'other', 'undisclosed'];

module.exports = {
  USER_STATUS, RESOURCE_TYPES, RESOURCE_STATUS, COPY_STATUS, COPY_CONDITION,
  LOAN_STATUS, RESERVATION_STATUS, FINE_TYPES, FINE_STATUS, ACCESS_LEVELS,
  CLEARANCE_STATUS, GROUP_STATUS, ATTENDANCE_STATUS, NOTIFICATION_TYPES,
  AUDIT_ACTIONS, INVENTORY_AUDIT_STATUS, GENDERS,
  PURCHASE_ORDER_STATUS, PAYMENT_STATUS, PAYMENT_METHODS,
};
