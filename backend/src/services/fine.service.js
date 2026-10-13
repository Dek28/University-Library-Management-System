const Fine = require('../models/Fine');
const FinePayment = require('../models/FinePayment');
const Loan = require('../models/Loan');
const ApiError = require('../utils/ApiError');
const auditService = require('./audit.service');
const settingsService = require('./settings.service');
const notificationService = require('./notification.service');
const userService = require('./user.service');
const { buildPagination, paginate, compact, dateRange } = require('../utils/query');
const { fineCode, paymentCode } = require('../utils/identifiers');
const { daysOverdue } = require('../utils/datetime');
const { inSession } = require('../utils/transaction');

const POPULATE = [
  { path: 'user', select: 'firstName lastName email registrationNumber employeeId' },
  { path: 'resource', select: 'title resourceType' },
  { path: 'loan', select: 'transactionId borrowDate dueDate returnDate' },
];

/**
 * Computes the overdue charge for a loan.
 *
 * Days inside the grace period are free; the total is capped at the policy
 * maximum so a forgotten book cannot accrue an unbounded debt.
 */
async function calculateOverdueFine(loan, resourceType, asOf = new Date()) {
  const policy = await settingsService.getFinePolicy(resourceType);
  const overdue = daysOverdue(loan.dueDate, asOf);
  const chargeableDays = Math.max(0, overdue - (policy.gracePeriodDays || 0));
  const raw = chargeableDays * policy.overdueRatePerDay;
  const amount = policy.maxFineAmount > 0 ? Math.min(raw, policy.maxFineAmount) : raw;
  return {
    daysOverdue: overdue,
    chargeableDays,
    amount: Number(amount.toFixed(2)),
    ratePerDay: policy.overdueRatePerDay,
    gracePeriodDays: policy.gracePeriodDays || 0,
    capped: policy.maxFineAmount > 0 && raw > policy.maxFineAmount,
  };
}

/** Charge for a copy returned in poor condition, or lost outright. */
async function calculateConditionFine({ condition, resourceType, copy }) {
  const policy = await settingsService.getFinePolicy(resourceType);
  const replacement = Number(copy?.replacementCost || 0);

  if (condition === 'lost') {
    const base = replacement > 0 ? replacement * (policy.replacementMultiplier || 1) : policy.lostItemBaseFine;
    return { fineType: 'lost', amount: Number(base.toFixed(2)), reason: 'Item reported lost' };
  }
  if (condition === 'severely_damaged') {
    return { fineType: 'damaged', amount: Number(policy.severelyDamagedFine.toFixed(2)), reason: 'Item returned severely damaged' };
  }
  if (condition === 'damaged') {
    return { fineType: 'damaged', amount: Number(policy.damagedItemFine.toFixed(2)), reason: 'Item returned damaged' };
  }
  return null;
}

/**
 * Creates a fine and links it back to its loan. Skips zero-value charges, and
 * every charge while the library has fines turned off: callers already treat
 * `null` as "no fine raised".
 */
async function createFine({ user, loan, resource, copy, fineType, amount, reason, daysOverdue: days = 0, createdBy }, session = null) {
  if (!amount || amount <= 0) return null;
  if (!(await settingsService.finesEnabled())) return null;
  const currency = (await settingsService.getCurrency()).code;

  const [fine] = await Fine.create([{
    fineCode: fineCode(),
    user,
    loan: loan || null,
    resource: resource || null,
    copy: copy || null,
    fineType,
    amount: Number(amount.toFixed(2)),
    currency,
    reason: reason || '',
    daysOverdue: days,
    createdBy: createdBy || null,
  }], inSession(session));

  if (loan) {
    await Loan.updateOne(
      { _id: loan },
      { $push: { fines: fine._id }, $inc: { fineAmount: fine.amount } },
      inSession(session),
    );
  }
  return fine;
}

async function list(query = {}, options = {}) {
  const pagination = buildPagination(query, { defaultSort: '-createdAt', ...options });
  const filter = compact({
    user: query.user,
    fineType: query.fineType,
    status: query.status,
  });
  if (query.outstandingOnly === true) filter.status = { $in: ['outstanding', 'partially_paid'] };
  const range = dateRange(query.from, query.to);
  if (range) filter.createdAt = range;

  const result = await paginate(Fine, filter, pagination, { populate: POPULATE });
  // `balance` is a virtual, so it must be computed for lean documents.
  result.items = result.items.map((f) => ({
    ...f,
    balance: Number(Math.max(0, f.amount - f.amountPaid - f.amountWaived).toFixed(2)),
  }));
  return result;
}

async function getById(id) {
  const fine = await Fine.findById(id).populate(POPULATE);
  if (!fine) throw ApiError.notFound('Fine not found');
  const payments = await FinePayment.find({ fine: id })
    .populate('processedBy', 'firstName lastName')
    .sort('-paidAt').lean();
  return { ...fine.toJSON(), balance: fine.balance, payments };
}

/** Total still owed by a member, and the fines making it up. */
async function getOutstandingForUser(userId) {
  const fines = await Fine.find({ user: userId, status: { $in: ['outstanding', 'partially_paid'] } })
    .populate('resource', 'title')
    .lean();
  const total = fines.reduce((sum, f) => sum + Math.max(0, f.amount - f.amountPaid - f.amountWaived), 0);
  return { total: Number(total.toFixed(2)), count: fines.length, fines };
}

async function addPayment(fineId, { amount, method, reference, notes }, actor, context = {}) {
  const fine = await Fine.findById(fineId);
  if (!fine) throw ApiError.notFound('Fine not found');
  if (['paid', 'waived', 'cancelled'].includes(fine.status)) {
    throw ApiError.badRequest(`This fine is already ${fine.status} and cannot take further payment`);
  }

  const balance = fine.balance;
  if (amount > balance + 0.001) {
    throw ApiError.badRequest(`Payment exceeds the outstanding balance of ${balance.toFixed(2)}`);
  }

  const payment = await FinePayment.create({
    receiptNumber: paymentCode(),
    fine: fine._id,
    user: fine.user,
    amount: Number(amount.toFixed(2)),
    kind: 'payment',
    method: method || 'cash',
    reference: reference || '',
    notes: notes || '',
    processedBy: actor._id,
  });

  fine.amountPaid = Number((fine.amountPaid + payment.amount).toFixed(2));
  fine.recalculateStatus();
  await fine.save();

  await userService.refreshUserCounters(fine.user);
  await auditService.record({
    ...context, actor, action: 'fine_paid', entityType: 'Fine', entityId: fine._id,
    entityLabel: fine.fineCode,
    oldValue: { amountPaid: fine.amountPaid - payment.amount, status: 'outstanding' },
    newValue: { amountPaid: fine.amountPaid, status: fine.status, receipt: payment.receiptNumber },
  });

  await notificationService.notify({
    user: fine.user,
    type: 'fine_paid',
    title: 'Payment recorded',
    message: `A payment of ${payment.amount.toFixed(2)} was recorded against fine ${fine.fineCode}. `
      + `Remaining balance: ${fine.balance.toFixed(2)}.`,
    entityType: 'Fine',
    entityId: fine._id,
    link: `/my-fines`,
  });

  return { fine: await getById(fine._id), payment };
}

/**
 * Waives all or part of a fine. Requires a reason, and always leaves an audit
 * entry naming the authorising officer.
 */
async function waive(fineId, { amount, reason }, actor, context = {}) {
  const fine = await Fine.findById(fineId);
  if (!fine) throw ApiError.notFound('Fine not found');
  if (['paid', 'waived', 'cancelled'].includes(fine.status)) {
    throw ApiError.badRequest(`This fine is already ${fine.status}`);
  }
  if (!reason || reason.trim().length < 5) {
    throw ApiError.badRequest('A written reason of at least 5 characters is required to waive a fine');
  }

  const balance = fine.balance;
  const waiveAmount = amount === undefined || amount === null ? balance : Number(Number(amount).toFixed(2));
  if (waiveAmount <= 0) throw ApiError.badRequest('Waived amount must be greater than zero');
  if (waiveAmount > balance + 0.001) {
    throw ApiError.badRequest(`Waiver exceeds the outstanding balance of ${balance.toFixed(2)}`);
  }

  const before = { amountWaived: fine.amountWaived, status: fine.status };

  await FinePayment.create({
    receiptNumber: paymentCode(),
    fine: fine._id,
    user: fine.user,
    amount: waiveAmount,
    kind: 'waiver',
    method: 'internal',
    notes: reason,
    processedBy: actor._id,
  });

  fine.amountWaived = Number((fine.amountWaived + waiveAmount).toFixed(2));
  fine.waivedBy = actor._id;
  fine.waiveReason = reason;
  fine.recalculateStatus();
  await fine.save();

  await userService.refreshUserCounters(fine.user);
  await auditService.record({
    ...context, actor, action: 'fine_waived', entityType: 'Fine', entityId: fine._id,
    entityLabel: fine.fineCode, oldValue: before,
    newValue: { amountWaived: fine.amountWaived, status: fine.status, reason },
    description: `Waived ${waiveAmount.toFixed(2)}: ${reason}`,
  });

  return getById(fine._id);
}

/** Manually raised charge, not tied to an automatic circulation event. */
async function createManualFine(payload, actor, context = {}) {
  if (!(await settingsService.finesEnabled())) {
    throw ApiError.conflict('Fines are turned off for this library (Settings → Circulation)');
  }
  const fine = await createFine({ ...payload, createdBy: actor._id });
  if (!fine) throw ApiError.badRequest('Fine amount must be greater than zero');

  await userService.refreshUserCounters(payload.user);
  await auditService.record({
    ...context, actor, action: 'fine_created', entityType: 'Fine', entityId: fine._id,
    entityLabel: fine.fineCode, newValue: fine.toObject(), description: 'Manual fine raised',
  });

  await notificationService.notify({
    user: payload.user,
    type: 'fine_created',
    title: 'A library fine was added to your account',
    message: `${fine.fineType} fine of ${fine.amount.toFixed(2)}. ${fine.reason}`,
    severity: 'warning',
    entityType: 'Fine',
    entityId: fine._id,
    link: '/my-fines',
  });

  return getById(fine._id);
}

async function cancel(fineId, reason, actor, context = {}) {
  const fine = await Fine.findById(fineId);
  if (!fine) throw ApiError.notFound('Fine not found');
  if (fine.amountPaid > 0) throw ApiError.badRequest('A fine with recorded payments cannot be cancelled; waive the balance instead');

  const before = { status: fine.status };
  fine.status = 'cancelled';
  fine.notes = `${fine.notes} | Cancelled: ${reason}`.trim();
  await fine.save();

  await userService.refreshUserCounters(fine.user);
  await auditService.record({
    ...context, actor, action: 'fine_adjusted', entityType: 'Fine', entityId: fine._id,
    entityLabel: fine.fineCode, oldValue: before, newValue: { status: 'cancelled', reason },
  });
  return getById(fine._id);
}

/** Aggregate totals used by dashboards and the finance report. */
async function summary({ from, to } = {}) {
  const match = {};
  const range = dateRange(from, to);
  if (range) match.createdAt = range;

  const [totals] = await Fine.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalCharged: { $sum: '$amount' },
        totalPaid: { $sum: '$amountPaid' },
        totalWaived: { $sum: '$amountWaived' },
        count: { $sum: 1 },
        outstandingCount: {
          $sum: { $cond: [{ $in: ['$status', ['outstanding', 'partially_paid']] }, 1, 0] },
        },
      },
    },
  ]);

  const byType = await Fine.aggregate([
    { $match: match },
    { $group: { _id: '$fineType', amount: { $sum: '$amount' }, paid: { $sum: '$amountPaid' }, count: { $sum: 1 } } },
    { $sort: { amount: -1 } },
  ]);

  const charged = totals?.totalCharged || 0;
  const paid = totals?.totalPaid || 0;
  const waived = totals?.totalWaived || 0;

  return {
    totalCharged: Number(charged.toFixed(2)),
    totalPaid: Number(paid.toFixed(2)),
    totalWaived: Number(waived.toFixed(2)),
    totalOutstanding: Number(Math.max(0, charged - paid - waived).toFixed(2)),
    count: totals?.count || 0,
    outstandingCount: totals?.outstandingCount || 0,
    byType: byType.map((t) => ({ fineType: t._id, amount: Number(t.amount.toFixed(2)), paid: Number(t.paid.toFixed(2)), count: t.count })),
  };
}

async function paymentHistory(query = {}) {
  const pagination = buildPagination(query, { defaultSort: '-paidAt' });
  const filter = compact({ user: query.user, kind: query.kind });
  const range = dateRange(query.from, query.to);
  if (range) filter.paidAt = range;
  return paginate(FinePayment, filter, pagination, {
    populate: [
      { path: 'user', select: 'firstName lastName registrationNumber' },
      { path: 'fine', select: 'fineCode fineType amount' },
      { path: 'processedBy', select: 'firstName lastName' },
    ],
  });
}

module.exports = {
  calculateOverdueFine, calculateConditionFine, createFine, list, getById,
  getOutstandingForUser, addPayment, waive, createManualFine, cancel, summary, paymentHistory,
};
