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

  const overdue = await Loan.find({ status: 'overdue' })
    .populate('resource', 'title')
    .limit(2000)
    .lean();

  const today = new Date().toISOString().slice(0, 10);
  const chargesFines = await settingsService.finesEnabled();
  let notified = 0;

  for (const loan of overdue) {
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
  const affected = [...new Set(overdue.map((l) => String(l.user)))];
  for (const userId of affected.slice(0, 500)) {
    // eslint-disable-next-line no-await-in-loop
    await userService.refreshUserCounters(userId);
  }

  return { markedOverdue: updated, notified, totalOverdue: overdue.length };
}

module.exports = { run };
