const Loan = require('../models/Loan');
const circulationService = require('../services/circulation.service');
const notificationService = require('../services/notification.service');
const userService = require('../services/user.service');
const settingsService = require('../services/settings.service');
const { daysOverdue } = require('../utils/datetime');

/**
 * Flags loans that passed their due date and alerts the borrower once per day.
 * The dedupe key makes a re-run on the same day a no-op.
 */
async function run() {
  const { updated } = await circulationService.markOverdueLoans();

  const today = new Date().toISOString().slice(0, 10);
  const chargesFines = await settingsService.finesEnabled();
  let notified = 0;
  let totalOverdue = 0;
  const affected = new Set();

  // A cursor walks every overdue loan; a fixed cap would leave the rest of
  // the borrowers unnotified with no sign that anything was skipped.
  const cursor = Loan.find({ status: 'overdue' }).populate('resource', 'title').lean().cursor();
  for (let loan = await cursor.next(); loan; loan = await cursor.next()) {
    totalOverdue += 1;
    affected.add(String(loan.user));
    const days = daysOverdue(loan.dueDate);
    // eslint-disable-next-line no-await-in-loop
    const created = await notificationService.notify({
      user: loan.user,
      type: 'overdue',
      title: 'Overdue library item',
      message: `"${loan.resource?.title}" was due on ${new Date(loan.dueDate).toISOString().slice(0, 10)} `
        + `and is now ${days} day(s) overdue.${chargesFines ? ' Fines accrue daily.' : ' Please return it.'}`,
      severity: 'warning',
      entityType: 'Loan',
      entityId: loan._id,
      link: '/my-borrowing',
      dedupeKey: `overdue:${loan._id}:${today}`,
    });
    if (created) notified += 1;
  }

  // Keep the per-member loan counters honest after status changes.
  for (const userId of affected) {
    // eslint-disable-next-line no-await-in-loop
    await userService.refreshUserCounters(userId);
  }

  return { markedOverdue: updated, notified, totalOverdue };
}

module.exports = { run };
