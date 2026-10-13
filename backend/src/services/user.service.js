const User = require('../models/User');
const Role = require('../models/Role');
const Loan = require('../models/Loan');
const Fine = require('../models/Fine');
const Reservation = require('../models/Reservation');
const ApiError = require('../utils/ApiError');
const auditService = require('./audit.service');
const { buildPagination, paginate, compact, like, dateRange } = require('../utils/query');
const { generateBarcode } = require('../utils/identifiers');
const { PROFILE_POPULATE } = require('./auth.service');
const { ROLE_KEYS } = require('../constants/permissions');

const LIST_SELECT = 'firstName middleName lastName email phone registrationNumber employeeId role status '
  + 'department faculty program academicYear yearOfStudy activeLoanCount outstandingFineTotal '
  + 'clearanceStatus lastLoginAt profilePhoto barcode createdAt';

const LIST_POPULATE = [
  { path: 'role', select: 'key name' },
  { path: 'department', select: 'code name' },
  { path: 'faculty', select: 'code name' },
  { path: 'program', select: 'code name' },
];

async function resolveRole(roleRef) {
  if (!roleRef) throw ApiError.badRequest('A role is required');
  const role = /^[0-9a-fA-F]{24}$/.test(roleRef)
    ? await Role.findById(roleRef)
    : await Role.findOne({ key: String(roleRef).toLowerCase() });
  if (!role) throw ApiError.badRequest(`Unknown role: ${roleRef}`);
  return role;
}

/**
 * Prevents privilege escalation: an actor may never create or promote an
 * account to a role at or above their own authority level, and only a
 * super administrator can mint another super administrator.
 */
async function assertCanAssignRole(actor, targetRole) {
  const actorRole = await Role.findById(actor.role).lean();
  if (!actorRole) throw ApiError.forbidden();
  if (actorRole.key === ROLE_KEYS.SUPER_ADMIN) return;
  if (targetRole.key === ROLE_KEYS.SUPER_ADMIN) {
    throw ApiError.forbidden('Only a super administrator can assign that role');
  }
  if (targetRole.level >= actorRole.level) {
    throw ApiError.forbidden('You cannot assign a role at or above your own authority level');
  }
}

function buildFilter(query) {
  const filter = compact({
    status: query.status,
    department: query.department,
    faculty: query.faculty,
    program: query.program,
    academicYear: query.academicYear,
    gender: query.gender,
  });

  if (query.role) filter.role = query.role;
  if (query.hasOutstandingFines === true) filter.outstandingFineTotal = { $gt: 0 };
  if (query.hasActiveLoans === true) filter.activeLoanCount = { $gt: 0 };

  const created = dateRange(query.from, query.to);
  if (created) filter.createdAt = created;

  if (query.search) {
    const term = query.search.trim();
    filter.$or = [
      { firstName: like(term) },
      { lastName: like(term) },
      { email: like(term) },
      { registrationNumber: like(term) },
      { employeeId: like(term) },
      { phone: like(term) },
      { barcode: term },
    ];
  }
  return filter;
}

async function listUsers(query = {}, options = {}) {
  const pagination = buildPagination(query, { defaultSort: '-createdAt', ...options });
  // Allow filtering by role key as well as id.
  if (query.roleKey) {
    const role = await Role.findOne({ key: query.roleKey }).lean();
    query.role = role ? role._id : null;
  }
  return paginate(User, buildFilter(query), pagination, { select: LIST_SELECT, populate: LIST_POPULATE });
}

async function getUserById(id) {
  const user = await User.findById(id).populate(PROFILE_POPULATE);
  if (!user) throw ApiError.notFound('User not found');
  return user;
}

/** Looks a borrower up by card barcode, registration/staff number or email. */
async function findByIdentifier(identifier) {
  const value = String(identifier || '').trim();
  if (!value) throw ApiError.badRequest('An identifier is required');
  const user = await User.findOne({
    $or: [
      { barcode: value },
      { registrationNumber: value.toUpperCase() },
      { employeeId: value.toUpperCase() },
      { email: value.toLowerCase() },
    ],
  }).populate(PROFILE_POPULATE);
  if (!user) throw ApiError.notFound(`No member found for "${identifier}"`);
  return user;
}

async function createUser(payload, actor, context = {}) {
  const role = await resolveRole(payload.role);
  await assertCanAssignRole(actor, role);

  const user = await User.create({
    ...payload,
    role: role._id,
    barcode: payload.barcode || generateBarcode('30'),
  });

  await auditService.record({
    ...context, actor, action: 'user_created', entityType: 'User', entityId: user._id,
    entityLabel: user.email, newValue: { email: user.email, role: role.key, status: user.status },
  });
  return getUserById(user._id);
}

async function updateUser(id, payload, actor, context = {}) {
  const user = await User.findById(id);
  if (!user) throw ApiError.notFound('User not found');

  const before = user.toObject();

  if (payload.role) {
    const role = await resolveRole(payload.role);
    await assertCanAssignRole(actor, role);
    payload.role = role._id;
  }

  // Status and password changes have their own dedicated endpoints.
  const { password, status, activeLoanCount, outstandingFineTotal, ...safe } = payload;
  user.set(safe);
  await user.save();

  await auditService.record({
    ...context, actor, action: 'user_updated', entityType: 'User', entityId: user._id,
    entityLabel: user.email, oldValue: before, newValue: user.toObject(),
  });
  return getUserById(user._id);
}

async function changeStatus(id, { status, reason }, actor, context = {}) {
  const user = await User.findById(id);
  if (!user) throw ApiError.notFound('User not found');
  if (String(user._id) === String(actor._id)) {
    throw ApiError.badRequest('You cannot change your own account status');
  }

  const targetRole = await Role.findById(user.role).lean();
  await assertCanAssignRole(actor, targetRole);

  // Archiving must not strand outstanding obligations.
  if (['archived', 'withdrawn'].includes(status)) {
    const openLoans = await Loan.countDocuments({ user: user._id, status: { $in: ['active', 'overdue'] } });
    if (openLoans > 0) {
      throw ApiError.conflict(`Cannot archive: the member still has ${openLoans} item(s) on loan`);
    }
  }

  const previous = user.status;
  user.status = status;
  user.statusReason = reason || '';
  await user.save();

  if (status === 'suspended') {
    await require('./token.service').revokeAllForUser(user._id, 'account suspended');
  }

  await auditService.record({
    ...context, actor, action: 'user_status_changed', entityType: 'User', entityId: user._id,
    entityLabel: user.email, oldValue: { status: previous }, newValue: { status, reason },
  });
  return getUserById(user._id);
}

async function resetUserPassword(id, newPassword, actor, context = {}) {
  const user = await User.findById(id).select('+password');
  if (!user) throw ApiError.notFound('User not found');

  const targetRole = await Role.findById(user.role).lean();
  await assertCanAssignRole(actor, targetRole);

  user.password = newPassword;
  user.mustChangePassword = true;
  await user.save();
  await require('./token.service').revokeAllForUser(user._id, 'password reset by administrator');

  await auditService.record({
    ...context, actor, action: 'password_reset', entityType: 'User', entityId: user._id,
    entityLabel: user.email, description: 'Password reset by administrator',
  });
  return true;
}

async function softDeleteUser(id, actor, context = {}) {
  const user = await User.findById(id);
  if (!user) throw ApiError.notFound('User not found');
  if (String(user._id) === String(actor._id)) throw ApiError.badRequest('You cannot delete your own account');

  const openLoans = await Loan.countDocuments({ user: user._id, status: { $in: ['active', 'overdue'] } });
  const openFines = await Fine.countDocuments({ user: user._id, status: { $in: ['outstanding', 'partially_paid'] } });
  if (openLoans || openFines) {
    throw ApiError.conflict('Cannot delete a member with open loans or unpaid fines. Archive the account instead.');
  }

  await user.softDelete(actor._id);
  await auditService.record({
    ...context, actor, action: 'user_status_changed', entityType: 'User', entityId: user._id,
    entityLabel: user.email, description: 'Account soft-deleted',
  });
  return true;
}

/** Loans, fines, reservations and counters for one member. */
async function getUserActivity(userId) {
  const [loans, fines, reservations, stats] = await Promise.all([
    Loan.find({ user: userId })
      .sort('-borrowDate').limit(50)
      .populate('resource', 'title resourceType')
      .populate('copy', 'accessionNumber barcode')
      .lean(),
    Fine.find({ user: userId }).sort('-createdAt').limit(50)
      .populate('resource', 'title').lean(),
    Reservation.find({ user: userId, status: { $in: ['pending', 'ready'] } })
      .populate('resource', 'title resourceType').lean(),
    Loan.aggregate([
      { $match: { user: require('mongoose').Types.ObjectId.createFromHexString(String(userId)) } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          active: { $sum: { $cond: [{ $in: ['$status', ['active', 'overdue']] }, 1, 0] } },
          overdue: { $sum: { $cond: [{ $eq: ['$status', 'overdue'] }, 1, 0] } },
          lost: { $sum: { $cond: [{ $eq: ['$status', 'lost'] }, 1, 0] } },
        },
      },
    ]),
  ]);

  const outstanding = fines
    .filter((f) => ['outstanding', 'partially_paid'].includes(f.status))
    .reduce((sum, f) => sum + Math.max(0, f.amount - f.amountPaid - f.amountWaived), 0);

  return {
    loans,
    fines,
    reservations,
    stats: {
      ...(stats[0] || { total: 0, active: 0, overdue: 0, lost: 0 }),
      outstandingFineTotal: Number(outstanding.toFixed(2)),
    },
  };
}

/** Recomputes the denormalised counters carried on the user document. */
async function refreshUserCounters(userId) {
  const [activeLoanCount, fineAgg] = await Promise.all([
    Loan.countDocuments({ user: userId, status: { $in: ['active', 'overdue'] } }),
    Fine.aggregate([
      {
        $match: {
          user: require('mongoose').Types.ObjectId.createFromHexString(String(userId)),
          status: { $in: ['outstanding', 'partially_paid'] },
        },
      },
      { $group: { _id: null, total: { $sum: { $subtract: ['$amount', { $add: ['$amountPaid', '$amountWaived'] }] } } } },
    ]),
  ]);

  const outstandingFineTotal = Number(Math.max(0, fineAgg[0]?.total || 0).toFixed(2));
  await User.updateOne({ _id: userId }, { $set: { activeLoanCount, outstandingFineTotal } });
  return { activeLoanCount, outstandingFineTotal };
}

module.exports = {
  listUsers, getUserById, findByIdentifier, createUser, updateUser, changeStatus,
  resetUserPassword, softDeleteUser, getUserActivity, refreshUserCounters,
  resolveRole, assertCanAssignRole, LIST_SELECT, LIST_POPULATE,
};
