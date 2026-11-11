/// Permission keys the API grants, mirrored from backend/src/constants/permissions.js.
class Perm {
  static const loanIssue = 'loan:issue';
  static const loanReturn = 'loan:return';
  static const loanRenewOwn = 'loan:renew_own';
  static const reservationCreateOwn = 'reservation:create_own';
  static const digitalView = 'digital:view';
  static const clearanceViewOwn = 'clearance:view_own';
  static const clearanceRequestOwn = 'clearance:request_own';
  static const finesViewOwn = 'fine:view_own';
  static const dashboardAdmin = 'dashboard:admin';
  static const dashboardLibrarian = 'dashboard:librarian';
  static const dashboardSelf = 'dashboard:self';
  static const groupView = 'group:view';
  static const groupViewOwn = 'group:view_own';
}
