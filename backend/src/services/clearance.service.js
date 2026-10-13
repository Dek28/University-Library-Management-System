const Clearance = require('../models/Clearance');
const Loan = require('../models/Loan');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const auditService = require('./audit.service');
const fineService = require('./fine.service');
const settingsService = require('./settings.service');
const notificationService = require('./notification.service');
const { buildPagination, paginate, compact, dateRange } = require('../utils/query');
const { clearanceCode, referenceCode } = require('../utils/identifiers');

const POPULATE = [
  {
    path: 'user',
    select: 'firstName middleName lastName email registrationNumber employeeId department program faculty graduationYear status',
    populate: [
      { path: 'department', select: 'code name' },
      { path: 'program', select: 'code name' },
      { path: 'faculty', select: 'code name' },
    ],
  },
  { path: 'verifiedBy', select: 'firstName lastName' },
  { path: 'overrideBy', select: 'firstName lastName' },
];

/**
 * Evaluates a member's library obligations right now.
 *
 * This is the single authority on whether clearance may be granted; it is
 * re-run at approval time so an approval can never rest on stale data.
 */
async function evaluateObligations(userId) {
  const [activeLoans, overdueLoans, lostLoans, damagedLoans, chargesFines] = await Promise.all([
    Loan.countDocuments({ user: userId, status: { $in: ['active', 'overdue'] } }),
    Loan.countDocuments({ user: userId, status: 'overdue' }),
    Loan.countDocuments({ user: userId, status: 'lost' }),
    Loan.countDocuments({ user: userId, status: 'damaged' }),
    settingsService.finesEnabled(),
  ]);
  // With fines turned off, fines are not an obligation: old unpaid ones are
  // neither counted nor listed (the records themselves are kept).
  const outstanding = chargesFines
    ? await fineService.getOutstandingForUser(userId)
    : { total: 0, count: 0, fines: [] };

  const blockingReasons = [];
  if (activeLoans > 0) blockingReasons.push(`${activeLoans} item(s) still on loan`);
  if (overdueLoans > 0) blockingReasons.push(`${overdueLoans} overdue item(s)`);
  if (outstanding.total > 0) {
    blockingReasons.push(`Unpaid library fines totalling ${outstanding.total.toFixed(2)}`);
  }

  // Lost and damaged items only block while their charges are unsettled, which
  // the fine check above already covers.
  return {
    obligations: {
      activeLoans,
      overdueLoans,
      lostItems: lostLoans,
      damagedItems: damagedLoans,
      outstandingFineTotal: outstanding.total,
      outstandingFineCount: outstanding.count,
    },
    blockingReasons,
    isClear: blockingReasons.length === 0,
    fines: outstanding.fines,
  };
}

/** Read-only obligation check for the clearance desk. */
async function checkMember(userId) {
  const user = await User.findById(userId).populate([
    { path: 'department', select: 'code name' },
    { path: 'program', select: 'code name' },
    { path: 'faculty', select: 'code name' },
    { path: 'role', select: 'key name' },
  ]);
  if (!user) throw ApiError.notFound('Member not found');

  const evaluation = await evaluateObligations(userId);
  const existing = await Clearance.findOne({ user: userId }).sort('-createdAt').populate(POPULATE);

  return {
    member: {
      id: String(user._id),
      fullName: user.fullName,
      identifier: user.identifier,
      email: user.email,
      status: user.status,
      department: user.department,
      program: user.program,
      faculty: user.faculty,
      graduationYear: user.graduationYear,
    },
    ...evaluation,
    currentClearance: existing,
  };
}

async function list(query = {}, options = {}) {
  const pagination = buildPagination(query, { defaultSort: '-createdAt', ...options });
  const filter = compact({ status: query.status, user: query.user });
  const range = dateRange(query.from, query.to);
  if (range) filter.createdAt = range;

  const result = await paginate(Clearance, filter, pagination, { populate: POPULATE });

  // Department filtering happens after population because it lives on the user.
  if (query.department) {
    result.items = result.items.filter((c) => String(c.user?.department?._id) === String(query.department));
  }
  return result;
}

async function getById(id) {
  const clearance = await Clearance.findById(id).populate(POPULATE);
  if (!clearance) throw ApiError.notFound('Clearance record not found');
  return clearance;
}

/** Opens (or refreshes) a clearance case and records the current obligations. */
async function request(userId, actor, context = {}) {
  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound('Member not found');

  const existing = await Clearance.findOne({ user: userId, status: { $in: ['pending', 'blocked'] } });
  const evaluation = await evaluateObligations(userId);

  const clearance = existing || new Clearance({
    clearanceCode: clearanceCode(),
    user: userId,
    requestedBy: actor?._id || userId,
  });

  clearance.status = evaluation.isClear ? 'pending' : 'blocked';
  clearance.obligations = evaluation.obligations;
  clearance.blockingReasons = evaluation.blockingReasons;
  clearance.checkedAt = new Date();
  await clearance.save();

  await User.updateOne({ _id: userId }, { $set: { clearanceStatus: clearance.status } });

  await auditService.record({
    ...context, actor, action: 'clearance_requested', entityType: 'Clearance', entityId: clearance._id,
    entityLabel: clearance.clearanceCode,
    newValue: { status: clearance.status, blockingReasons: clearance.blockingReasons },
  });

  await notificationService.notify({
    user: userId,
    type: 'clearance_update',
    title: evaluation.isClear ? 'Clearance request received' : 'Clearance is blocked',
    message: evaluation.isClear
      ? 'Your library clearance request is awaiting verification.'
      : `Your clearance is blocked: ${evaluation.blockingReasons.join('; ')}`,
    severity: evaluation.isClear ? 'info' : 'warning',
    entityType: 'Clearance',
    entityId: clearance._id,
    link: '/my-clearance',
  });

  return getById(clearance._id);
}

/**
 * Approves clearance.
 *
 * Obligations are re-evaluated at this moment. Approving despite live
 * obligations is only possible through an explicit, reasoned override by a
 * user holding the override permission, and that decision is always audited.
 */
async function approve(id, { comments, override = false, overrideReason }, actor, options = {}, context = {}) {
  const clearance = await Clearance.findById(id);
  if (!clearance) throw ApiError.notFound('Clearance record not found');
  if (clearance.status === 'cleared') throw ApiError.badRequest('This member is already cleared');

  const evaluation = await evaluateObligations(clearance.user);

  if (!evaluation.isClear) {
    if (!override) {
      // Refresh the stored snapshot so the desk sees why it failed.
      clearance.status = 'blocked';
      clearance.obligations = evaluation.obligations;
      clearance.blockingReasons = evaluation.blockingReasons;
      clearance.checkedAt = new Date();
      await clearance.save();
      throw ApiError.conflict(
        `Clearance cannot be granted: ${evaluation.blockingReasons.join('; ')}. `
        + 'An authorised override with a written reason is required.',
      );
    }
    if (!options.canOverride) {
      throw ApiError.forbidden('You are not authorised to override clearance obligations');
    }
    if (!overrideReason || overrideReason.trim().length < 10) {
      throw ApiError.badRequest('An override requires a written reason of at least 10 characters');
    }
  }

  clearance.status = 'cleared';
  clearance.obligations = evaluation.obligations;
  clearance.blockingReasons = evaluation.blockingReasons;
  clearance.checkedAt = new Date();
  clearance.verifiedBy = actor._id;
  clearance.verifiedAt = new Date();
  clearance.comments = comments || clearance.comments;
  clearance.certificateNumber = clearance.certificateNumber || referenceCode('CERT');

  if (!evaluation.isClear && override) {
    clearance.isOverride = true;
    clearance.overrideReason = overrideReason;
    clearance.overrideBy = actor._id;
    clearance.overrideAt = new Date();
  }
  await clearance.save();

  await User.updateOne({ _id: clearance.user }, { $set: { clearanceStatus: 'cleared' } });

  await auditService.record({
    ...context, actor,
    action: clearance.isOverride ? 'clearance_override' : 'clearance_approved',
    entityType: 'Clearance', entityId: clearance._id, entityLabel: clearance.clearanceCode,
    newValue: {
      status: 'cleared',
      certificateNumber: clearance.certificateNumber,
      override: clearance.isOverride,
      overrideReason: clearance.overrideReason || undefined,
      obligationsAtApproval: evaluation.obligations,
    },
    description: clearance.isOverride
      ? `Clearance granted by override: ${overrideReason}`
      : 'Clearance granted after obligation check passed',
  });

  await notificationService.notify({
    user: clearance.user,
    type: 'clearance_update',
    title: 'Library clearance granted',
    message: `You have been cleared by the library. Certificate number ${clearance.certificateNumber}.`,
    entityType: 'Clearance',
    entityId: clearance._id,
    link: '/my-clearance',
  });

  return getById(clearance._id);
}

async function reject(id, { reason }, actor, context = {}) {
  const clearance = await Clearance.findById(id);
  if (!clearance) throw ApiError.notFound('Clearance record not found');
  if (clearance.status === 'cleared') throw ApiError.badRequest('A granted clearance cannot be rejected');

  clearance.status = 'rejected';
  clearance.verifiedBy = actor._id;
  clearance.verifiedAt = new Date();
  clearance.comments = reason;
  await clearance.save();

  await User.updateOne({ _id: clearance.user }, { $set: { clearanceStatus: 'rejected' } });

  await auditService.record({
    ...context, actor, action: 'clearance_rejected', entityType: 'Clearance', entityId: clearance._id,
    entityLabel: clearance.clearanceCode, newValue: { status: 'rejected', reason },
  });

  await notificationService.notify({
    user: clearance.user,
    type: 'clearance_update',
    title: 'Library clearance rejected',
    message: `Your clearance request was rejected. Reason: ${reason}`,
    severity: 'warning',
    entityType: 'Clearance',
    entityId: clearance._id,
    link: '/my-clearance',
  });

  return getById(clearance._id);
}

/** The caller's own most recent clearance case, with a live obligation check. */
async function getOwn(userId) {
  const clearance = await Clearance.findOne({ user: userId }).sort('-createdAt').populate(POPULATE);
  const evaluation = await evaluateObligations(userId);
  return { clearance, ...evaluation };
}

async function statistics() {
  const rows = await Clearance.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]);
  return rows.reduce((acc, r) => { acc[r._id] = r.count; return acc; }, {});
}

module.exports = {
  evaluateObligations, checkMember, list, getById, request,
  approve, reject, getOwn, statistics, POPULATE,
};
