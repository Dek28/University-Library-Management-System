const AuditLog = require('../models/AuditLog');
const logger = require('../config/logger');
const { buildPagination, paginate, compact, dateRange, like } = require('../utils/query');

/** Fields that must never be persisted into an audit diff. */
const REDACTED = ['password', 'newPassword', 'currentPassword', 'token', 'refreshToken', 'tokenHash', 'passwordResetTokenHash'];

function sanitiseValue(value) {
  if (!value || typeof value !== 'object') return value ?? null;
  const plain = typeof value.toObject === 'function' ? value.toObject() : value;
  return Object.entries(plain).reduce((acc, [k, v]) => {
    if (REDACTED.includes(k)) return acc;
    acc[k] = v && typeof v === 'object' && v._bsontype ? String(v) : v;
    return acc;
  }, {});
}

/**
 * Writes an audit entry. Auditing must never break the operation that
 * triggered it, so failures are logged rather than thrown.
 */
async function record({
  req, actor, action, entityType, entityId, entityLabel,
  oldValue, newValue, description, status = 'success',
} = {}) {
  try {
    const user = actor || req?.user;
    await AuditLog.create({
      user: user?._id || user?.id || null,
      actorName: user?.fullName || user?.email || 'system',
      actorRole: user?.roleKey || user?.role?.key || '',
      action,
      entityType: entityType || null,
      entityId: entityId || null,
      entityLabel: entityLabel || '',
      oldValue: sanitiseValue(oldValue),
      newValue: sanitiseValue(newValue),
      description: description || '',
      status,
      ipAddress: req?.clientIp || req?.ip || '',
      userAgent: req?.get?.('user-agent') || '',
      method: req?.method || '',
      path: req?.originalUrl || '',
    });
  } catch (err) {
    logger.error(`Failed to write audit log for ${action}: ${err.message}`);
  }
}

async function list(query = {}) {
  const pagination = buildPagination(query, { defaultSort: '-createdAt' });
  const filter = compact({
    action: query.action,
    entityType: query.entityType,
    user: query.user,
    status: query.status,
  });
  if (query.entityId) filter.entityId = query.entityId;
  const range = dateRange(query.from, query.to);
  if (range) filter.createdAt = range;
  if (query.search) {
    filter.$or = [
      { actorName: like(query.search) },
      { entityLabel: like(query.search) },
      { description: like(query.search) },
    ];
  }
  return paginate(AuditLog, filter, pagination, { populate: { path: 'user', select: 'firstName lastName email' } });
}

module.exports = { record, list };
