const catchAsync = require('../utils/catchAsync');
const { ok, paginated } = require('../utils/response');
const notificationService = require('../services/notification.service');
const User = require('../models/User');

const list = catchAsync(async (req, res) => {
  const result = await notificationService.listForUser(req.user._id, req.query);
  return paginated(res, { items: result.items, page: result.page, limit: result.limit, total: result.total });
});

const unreadCount = catchAsync(async (req, res) =>
  ok(res, { message: 'Unread notifications', data: { count: await notificationService.unreadCount(req.user._id) } }));

const markRead = catchAsync(async (req, res) => {
  const result = await notificationService.markRead(req.user._id, req.body.ids);
  return ok(res, { message: `${result.modifiedCount} notification(s) marked as read` });
});

const markAllRead = catchAsync(async (req, res) => {
  const result = await notificationService.markAllRead(req.user._id);
  return ok(res, { message: `${result.modifiedCount} notification(s) marked as read` });
});

const remove = catchAsync(async (req, res) => {
  await notificationService.remove(req.user._id, req.params.id);
  return ok(res, { message: 'Notification deleted' });
});

/** Sends an announcement to a whole role, or to named recipients. */
const broadcast = catchAsync(async (req, res) => {
  const { roleKey, userIds, title, message, severity } = req.body;

  let recipients = userIds;
  if (!recipients?.length) {
    const filter = { status: 'active' };
    if (roleKey) {
      const role = await require('../models/Role').findOne({ key: roleKey }).lean();
      if (role) filter.role = role._id;
    }
    recipients = (await User.find(filter).select('_id').lean()).map((u) => u._id);
  }

  let sent = 0;
  for (const userId of recipients) {
    // eslint-disable-next-line no-await-in-loop
    const created = await notificationService.notify({
      user: userId, type: 'system', title, message, severity: severity || 'info',
    });
    if (created) sent += 1;
  }

  return ok(res, { message: `Announcement delivered to ${sent} member(s)`, data: { sent } });
});

module.exports = { list, unreadCount, markRead, markAllRead, remove, broadcast };
