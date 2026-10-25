const Loan = require('../models/Loan');
const settingsService = require('../services/settings.service');
const notificationService = require('../services/notification.service');
const { addDays, daysUntil, startOfDay, endOfDay } = require('../utils/datetime');

/** Warns borrowers whose items fall due inside the configured reminder window. */
async function run() {
  const settings = await settingsService.getSettings();
  const windowDays = settings.circulation.dueSoonReminderDays;

  const cursor = Loan.find({
    status: 'active',
    dueDate: { $gte: startOfDay(), $lte: endOfDay(addDays(new Date(), windowDays)) },
  })
    .populate('resource', 'title')
    .lean()
    .cursor();

  const today = new Date().toISOString().slice(0, 10);
  let notified = 0;
  let candidates = 0;

  for (let loan = await cursor.next(); loan; loan = await cursor.next()) {
    candidates += 1;
    const remaining = daysUntil(loan.dueDate);
    // eslint-disable-next-line no-await-in-loop
    const created = await notificationService.notify({
      user: loan.user,
      type: 'due_soon',
      title: remaining === 0 ? 'Library item due today' : `Library item due in ${remaining} day(s)`,
      message: `"${loan.resource?.title}" is due on ${new Date(loan.dueDate).toISOString().slice(0, 10)}. `
        + (settings.circulation.finesEnabled === false
          ? 'Renew it online or return it on time.'
          : 'Renew it online or return it to avoid a fine.'),
      entityType: 'Loan',
      entityId: loan._id,
      link: '/my-borrowing',
      dedupeKey: `due_soon:${loan._id}:${today}`,
    });
    if (created) notified += 1;
  }

  return { candidates, notified, windowDays };
}

module.exports = { run };
