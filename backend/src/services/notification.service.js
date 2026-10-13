const Notification = require('../models/Notification');
const logger = require('../config/logger');
const { buildPagination, paginate, compact } = require('../utils/query');

/**
 * Delivery channels.
 *
 * Only `in_app` is wired up. Email/SMS/WhatsApp transports register themselves
 * here later without any caller needing to change: `dispatch` walks whatever is
 * registered and records the outcome per channel on the notification.
 */
const transports = new Map();

const registerTransport = (name, handler) => transports.set(name, handler);

async function deliverExternal(notification, user) {
  const results = [];
  for (const [name, handler] of transports.entries()) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await handler(notification, user);
      results.push({ channel: name, status: 'sent', sentAt: new Date() });
    } catch (err) {
      logger.warn(`Notification transport ${name} failed: ${err.message}`);
      results.push({ channel: name, status: 'failed', sentAt: new Date(), error: err.message });
    }
  }
  return results;
}

/**
 * Creates an in-app notification (and fans out to any registered transport).
 * `dedupeKey` makes nightly reminder jobs idempotent.
 */
async function notify({ user, type, title, message, severity = 'info', entityType, entityId, link, dedupeKey }) {
  if (!user) return null;
  try {
    const notification = await Notification.create({
      user,
      type,
      title,
      message,
      severity,
      entityType: entityType || null,
      entityId: entityId || null,
      link: link || null,
      dedupeKey: dedupeKey || null,
      channels: [{ channel: 'in_app', status: 'sent', sentAt: new Date() }],
    });

    if (transports.size) {
      const external = await deliverExternal(notification, user);
      if (external.length) {
        notification.channels.push(...external);
        await notification.save();
      }
    }
    return notification;
  } catch (err) {
    // Duplicate dedupeKey means the reminder already went out, so not an error.
    if (err.code === 11000) return null;
    logger.error(`Failed to create notification (${type}): ${err.message}`);
    return null;
  }
}

async function listForUser(userId, query = {}) {
  const pagination = buildPagination(query, { defaultSort: '-createdAt' });
  const filter = compact({
    user: userId,
    type: query.type,
    isRead: query.isRead === undefined ? undefined : query.isRead === 'true' || query.isRead === true,
  });
  return paginate(Notification, filter, pagination);
}

const unreadCount = (userId) => Notification.countDocuments({ user: userId, isRead: false });

const markRead = (userId, ids) =>
  Notification.updateMany(
    { user: userId, _id: { $in: ids }, isRead: false },
    { $set: { isRead: true, readAt: new Date() } },
  );

const markAllRead = (userId) =>
  Notification.updateMany({ user: userId, isRead: false }, { $set: { isRead: true, readAt: new Date() } });

const remove = (userId, id) => Notification.findOneAndDelete({ _id: id, user: userId });

module.exports = {
  notify, listForUser, unreadCount, markRead, markAllRead, remove, registerTransport,
};
