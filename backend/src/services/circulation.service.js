const Loan = require('../models/Loan');
const Renewal = require('../models/Renewal');
const Reservation = require('../models/Reservation');
const ResourceCopy = require('../models/ResourceCopy');
const Resource = require('../models/Resource');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const auditService = require('./audit.service');
const settingsService = require('./settings.service');
const fineService = require('./fine.service');
const notificationService = require('./notification.service');
const reservationService = require('./reservation.service');
const resourceService = require('./resource.service');
const userService = require('./user.service');
const { withTransaction, inSession } = require('../utils/transaction');
const { buildPagination, paginate, compact, dateRange } = require('../utils/query');
const { nextLoanCode } = require('./sequence.service');
const { addDays, daysOverdue, startOfDay, endOfDay } = require('../utils/datetime');

const LOAN_POPULATE = [
  { path: 'user', select: 'firstName lastName email registrationNumber employeeId phone' },
  { path: 'resource', select: 'title subtitle resourceType coverImage' },
  { path: 'copy', select: 'accessionNumber barcode condition shelf' },
  { path: 'issuedBy', select: 'firstName lastName' },
  { path: 'returnedTo', select: 'firstName lastName' },
];

/**
 * Checks every rule that governs whether a member may take another item.
 * Returns the full picture rather than throwing, so the circulation desk can
 * show all blockers at once before a librarian scans anything.
 */
async function checkEligibility(userId, { resourceId } = {}) {
  const user = await User.findById(userId).populate('role', 'key name');
  if (!user) throw ApiError.notFound('Member not found');

  const roleKey = user.role?.key || 'student';
  const [rule, settings, outstanding, chargesFines] = await Promise.all([
    settingsService.getBorrowingRule(roleKey),
    settingsService.getSettings(),
    fineService.getOutstandingForUser(userId),
    settingsService.finesEnabled(),
  ]);

  const [activeLoans, overdueLoans] = await Promise.all([
    Loan.countDocuments({ user: userId, status: { $in: ['active', 'overdue'] } }),
    Loan.countDocuments({ user: userId, status: 'overdue' }),
  ]);

  const blockers = [];
  if (user.status === 'suspended') blockers.push('The account is suspended');
  if (!['active', 'graduated'].includes(user.status)) blockers.push(`The account is ${user.status.replace('_', ' ')}`);
  if (user.borrowingSuspendedUntil && user.borrowingSuspendedUntil > new Date()) {
    blockers.push(`Borrowing is suspended until ${user.borrowingSuspendedUntil.toISOString().slice(0, 10)}`);
  }
  if (activeLoans >= rule.maxBooks) {
    blockers.push(`Borrowing limit reached (${activeLoans}/${rule.maxBooks} items)`);
  }
  // With fines turned off, old unpaid fines no longer stand in the way.
  if (chargesFines && rule.blockingFineThreshold > 0 && outstanding.total >= rule.blockingFineThreshold) {
    blockers.push(`Outstanding fines of ${outstanding.total.toFixed(2)} exceed the ${rule.blockingFineThreshold.toFixed(2)} limit`);
  }
  if (settings.circulation.blockBorrowingWhenOverdue && overdueLoans > 0) {
    blockers.push(`${overdueLoans} item(s) are overdue and must be returned first`);
  }

  if (resourceId) {
    const resource = await Resource.findById(resourceId).select('resourceType isBorrowable isReferenceOnly title');
    if (!resource) throw ApiError.notFound('Catalogue record not found');
    if (!resource.isBorrowable) blockers.push(`"${resource.title}" is not available for loan`);
    if (resource.isReferenceOnly) blockers.push(`"${resource.title}" is reference-only`);
    if (rule.allowedResourceTypes?.length && !rule.allowedResourceTypes.includes(resource.resourceType)) {
      blockers.push(`Members with the ${roleKey} role may not borrow ${resource.resourceType} items`);
    }
  }

  return {
    eligible: blockers.length === 0,
    blockers,
    member: {
      id: String(user._id),
      fullName: user.fullName,
      identifier: user.identifier,
      status: user.status,
      role: user.role?.name,
      photo: user.profilePhoto,
    },
    limits: {
      maxBooks: rule.maxBooks,
      activeLoans,
      remaining: Math.max(0, rule.maxBooks - activeLoans),
      loanPeriodDays: rule.loanPeriodDays,
      maxRenewals: rule.maxRenewals,
      overdueLoans,
      outstandingFines: outstanding.total,
      blockingFineThreshold: rule.blockingFineThreshold,
    },
  };
}

/**
 * Issues a copy to a member.
 *
 * Runs in a transaction where the deployment supports one. The copy status is
 * flipped with a conditional update so two simultaneous issues of the same copy
 * cannot both succeed even on a standalone MongoDB; the unique partial index on
 * `Loan.copy` is the second line of defence.
 */
async function issue({ userIdentifier, copyIdentifier, dueDate: requestedDueDate, notes }, actor, context = {}) {
  const member = await userService.findByIdentifier(userIdentifier);
  const copy = await require('./copy.service').findByIdentifier(copyIdentifier);

  const eligibility = await checkEligibility(member._id, { resourceId: copy.resource._id || copy.resource });
  if (!eligibility.eligible) {
    throw ApiError.conflict(`Cannot issue: ${eligibility.blockers.join('; ')}`);
  }

  if (copy.status === 'reserved') {
    // A held copy may only go to the member it is being held for.
    const hold = await reservationService.findReadyFor(member._id, copy.resource._id || copy.resource);
    if (!hold) throw ApiError.conflict('This copy is being held for another member');
  } else if (copy.status !== 'available') {
    throw ApiError.conflict(`This copy is not available (current status: ${copy.status})`);
  }

  const roleKey = member.role?.key || 'student';
  const rule = await settingsService.getBorrowingRule(roleKey);
  const dueDate = requestedDueDate
    ? endOfDay(new Date(requestedDueDate))
    : endOfDay(addDays(new Date(), rule.loanPeriodDays));

  if (dueDate <= new Date()) throw ApiError.badRequest('The due date must be in the future');

  // Taken once, before the writes, so a retried transaction reuses it.
  const transactionId = await nextLoanCode();

  return withTransaction(async (session) => {
    // Conditional claim: only succeeds if the copy is still issuable.
    const claim = await ResourceCopy.updateOne(
      { _id: copy._id, status: { $in: ['available', 'reserved'] } },
      { $set: { status: 'borrowed', lastBorrowedAt: new Date() }, $inc: { borrowCount: 1 } },
      inSession(session),
    );
    if (claim.modifiedCount !== 1) {
      throw ApiError.conflict('This copy was issued to someone else moments ago. Please rescan.');
    }

    const [loan] = await Loan.create([{
      transactionId,
      user: member._id,
      resource: copy.resource._id || copy.resource,
      copy: copy._id,
      borrowDate: new Date(),
      dueDate,
      status: 'active',
      issuedBy: actor._id,
      maxRenewals: rule.maxRenewals,
      conditionOnIssue: copy.condition,
      notes: notes || '',
    }], inSession(session));

    await ResourceCopy.updateOne({ _id: copy._id }, { $set: { currentLoan: loan._id } }, inSession(session));

    const hold = await reservationService.findReadyFor(member._id, loan.resource, session);
    if (hold) await reservationService.markCompleted(hold._id, session);

    await Resource.updateOne({ _id: loan.resource }, { $inc: { borrowCount: 1 } }, inSession(session));
    await User.updateOne({ _id: member._id }, { $inc: { activeLoanCount: 1 } }, inSession(session));
    await resourceService.syncAvailability(loan.resource, session);

    await auditService.record({
      ...context, actor, action: 'loan_issued', entityType: 'Loan', entityId: loan._id,
      entityLabel: loan.transactionId,
      newValue: {
        member: member.identifier,
        copy: copy.accessionNumber,
        dueDate,
        title: copy.resource?.title,
      },
    });

    await notificationService.notify({
      user: member._id,
      type: 'due_reminder',
      title: 'Item borrowed',
      message: `"${copy.resource?.title}" is due back on ${dueDate.toISOString().slice(0, 10)}.`,
      entityType: 'Loan',
      entityId: loan._id,
      link: '/my-borrowing',
    });

    return Loan.findById(loan._id).populate(LOAN_POPULATE);
  });
}

/**
 * Receives a returned copy.
 *
 * Overdue and condition fines are raised here, the copy is either shelved,
 * quarantined or written off, and any waiting reservation is promoted.
 */
async function returnLoan({ copyIdentifier, loanId, condition = 'good', notes }, actor, context = {}) {
  let loan;
  if (loanId) {
    loan = await Loan.findById(loanId);
  } else {
    const copy = await require('./copy.service').findByIdentifier(copyIdentifier);
    loan = await Loan.findOne({ copy: copy._id, status: { $in: ['active', 'overdue'] } });
    if (!loan) throw ApiError.notFound(`No open loan found for copy ${copy.accessionNumber}`);
  }

  if (!loan) throw ApiError.notFound('Loan not found');
  if (!['active', 'overdue'].includes(loan.status)) {
    throw ApiError.conflict(`This loan was already closed as "${loan.status}"`);
  }

  const [copy, resource] = await Promise.all([
    ResourceCopy.findById(loan.copy),
    Resource.findById(loan.resource).select('title resourceType'),
  ]);

  const returnedAt = new Date();
  const overdueDays = daysOverdue(loan.dueDate, returnedAt);

  const overdueCalc = overdueDays > 0
    ? await fineService.calculateOverdueFine(loan, resource?.resourceType, returnedAt)
    : null;
  const conditionCalc = await fineService.calculateConditionFine({
    condition, resourceType: resource?.resourceType, copy,
  });

  return withTransaction(async (session) => {
    loan.status = condition === 'lost' ? 'lost' : (['damaged', 'severely_damaged'].includes(condition) ? 'damaged' : 'returned');
    loan.returnDate = returnedAt;
    loan.returnedTo = actor._id;
    loan.conditionOnReturn = condition;
    loan.daysOverdue = overdueDays;
    loan.returnNotes = notes || '';
    await loan.save(inSession(session));

    // Where the copy goes next depends on the condition it came back in.
    const nextStatus = {
      lost: 'lost',
      severely_damaged: 'damaged',
      damaged: 'damaged',
    }[condition] || 'available';

    await ResourceCopy.updateOne(
      { _id: loan.copy },
      { $set: { status: nextStatus, condition: condition === 'lost' ? 'lost' : condition, currentLoan: null } },
      inSession(session),
    );

    const fines = [];
    if (overdueCalc?.amount > 0) {
      const fine = await fineService.createFine({
        user: loan.user,
        loan: loan._id,
        resource: loan.resource,
        copy: loan.copy,
        fineType: 'overdue',
        amount: overdueCalc.amount,
        reason: `${overdueCalc.chargeableDays} chargeable day(s) overdue at ${overdueCalc.ratePerDay}/day`,
        daysOverdue: overdueDays,
        createdBy: actor._id,
      }, session);
      if (fine) fines.push(fine);
    }
    if (conditionCalc) {
      const fine = await fineService.createFine({
        user: loan.user,
        loan: loan._id,
        resource: loan.resource,
        copy: loan.copy,
        fineType: conditionCalc.fineType,
        amount: conditionCalc.amount,
        reason: conditionCalc.reason,
        createdBy: actor._id,
      }, session);
      if (fine) fines.push(fine);
    }

    await User.updateOne({ _id: loan.user }, { $inc: { activeLoanCount: -1 } }, inSession(session));
    await resourceService.syncAvailability(loan.resource, session);

    // Only a shelf-ready copy can satisfy a waiting hold.
    let promoted = null;
    if (nextStatus === 'available') {
      promoted = await reservationService.allocateNext(loan.resource, loan.copy, actor, session);
      if (promoted) await resourceService.syncAvailability(loan.resource, session);
    }

    return { loan, fines, promoted, overdueDays, resource, copy };
  }).then(async (result) => {
    // Counter refresh and notifications run outside the transaction: they are
    // derived data, and must not be able to roll the return back.
    await userService.refreshUserCounters(loan.user);

    await auditService.record({
      ...context, actor, action: 'loan_returned', entityType: 'Loan', entityId: loan._id,
      entityLabel: loan.transactionId,
      newValue: {
        condition,
        daysOverdue: result.overdueDays,
        finesRaised: result.fines.map((f) => ({ code: f.fineCode, amount: f.amount, type: f.fineType })),
        reservationPromoted: Boolean(result.promoted),
      },
    });

    for (const fine of result.fines) {
      // eslint-disable-next-line no-await-in-loop
      await notificationService.notify({
        user: loan.user,
        type: 'fine_created',
        title: `A ${fine.fineType} fine was added to your account`,
        message: `${fine.reason}. ${fine.amount.toFixed(2)} (${fine.fineCode}).`,
        severity: 'warning',
        entityType: 'Fine',
        entityId: fine._id,
        link: '/my-fines',
      });
    }

    return {
      loan: await Loan.findById(loan._id).populate(LOAN_POPULATE),
      fines: result.fines,
      daysOverdue: result.overdueDays,
      reservationPromoted: Boolean(result.promoted),
      copyStatus: (await ResourceCopy.findById(loan.copy).select('status')).status,
    };
  });
}

/** Extends a loan, subject to the renewal policy and any waiting hold. */
async function renew(loanId, { notes, channel = 'desk' }, actor, context = {}) {
  const loan = await Loan.findById(loanId);
  if (!loan) throw ApiError.notFound('Loan not found');
  if (!['active', 'overdue'].includes(loan.status)) {
    throw ApiError.badRequest(`This loan is ${loan.status} and cannot be renewed`);
  }

  const [member, settings] = await Promise.all([
    User.findById(loan.user).populate('role', 'key'),
    settingsService.getSettings(),
  ]);
  const rule = await settingsService.getBorrowingRule(member?.role?.key || 'student');

  const maxRenewals = loan.maxRenewals ?? rule.maxRenewals;
  if (loan.renewalCount >= maxRenewals) {
    throw ApiError.conflict(`The renewal limit of ${maxRenewals} has been reached for this loan`);
  }

  if (settings.circulation.blockRenewalWhenReserved) {
    const waiting = await Reservation.countDocuments({ resource: loan.resource, status: { $in: ['pending', 'ready'] } });
    if (waiting > 0) {
      throw ApiError.conflict('Another member is waiting for this title, so it cannot be renewed');
    }
  }

  if (member.status === 'suspended') throw ApiError.forbidden('The account is suspended');

  if (await settingsService.finesEnabled()) {
    const outstanding = await fineService.getOutstandingForUser(loan.user);
    if (rule.blockingFineThreshold > 0 && outstanding.total >= rule.blockingFineThreshold) {
      throw ApiError.conflict(`Outstanding fines of ${outstanding.total.toFixed(2)} block renewal`);
    }
  }

  // A renewal extends from the current due date so an early renewal never
  // shortens a loan; an already-overdue loan restarts from today instead, so
  // the time it was late is not silently returned to the borrower.
  const previousDueDate = loan.dueDate;
  const period = rule.renewalPeriodDays || rule.loanPeriodDays;
  const extendFrom = previousDueDate > new Date() ? previousDueDate : new Date();
  const newDueDate = endOfDay(addDays(extendFrom, period));

  return withTransaction(async (session) => {
    loan.dueDate = newDueDate;
    loan.renewalCount += 1;
    loan.status = 'active';
    loan.daysOverdue = 0;
    await loan.save(inSession(session));

    await Renewal.create([{
      loan: loan._id,
      user: loan.user,
      previousDueDate,
      newDueDate,
      renewalNumber: loan.renewalCount,
      renewedBy: actor._id,
      channel,
      notes: notes || '',
    }], inSession(session));

    await auditService.record({
      ...context, actor, action: 'loan_renewed', entityType: 'Loan', entityId: loan._id,
      entityLabel: loan.transactionId,
      oldValue: { dueDate: previousDueDate, renewalCount: loan.renewalCount - 1 },
      newValue: { dueDate: newDueDate, renewalCount: loan.renewalCount },
    });

    await notificationService.notify({
      user: loan.user,
      type: 'due_reminder',
      title: 'Loan renewed',
      message: `Your loan was renewed. The new due date is ${newDueDate.toISOString().slice(0, 10)}.`,
      entityType: 'Loan',
      entityId: loan._id,
      link: '/my-borrowing',
    });

    return Loan.findById(loan._id).populate(LOAN_POPULATE);
  });
}

/** Writes a loan off as lost and raises the replacement charge. */
async function markLost(loanId, { reason }, actor, context = {}) {
  const loan = await Loan.findById(loanId);
  if (!loan) throw ApiError.notFound('Loan not found');
  if (!['active', 'overdue'].includes(loan.status)) {
    throw ApiError.badRequest(`This loan is already closed as "${loan.status}"`);
  }

  const [copy, resource] = await Promise.all([
    ResourceCopy.findById(loan.copy),
    Resource.findById(loan.resource).select('title resourceType'),
  ]);

  const lostCalc = await fineService.calculateConditionFine({
    condition: 'lost', resourceType: resource?.resourceType, copy,
  });
  const overdueDays = daysOverdue(loan.dueDate);
  const overdueCalc = overdueDays > 0
    ? await fineService.calculateOverdueFine(loan, resource?.resourceType)
    : null;

  const result = await withTransaction(async (session) => {
    loan.status = 'lost';
    loan.returnDate = new Date();
    loan.returnedTo = actor._id;
    loan.conditionOnReturn = 'lost';
    loan.daysOverdue = overdueDays;
    loan.returnNotes = reason || 'Reported lost';
    await loan.save(inSession(session));

    await ResourceCopy.updateOne(
      { _id: loan.copy },
      { $set: { status: 'lost', condition: 'lost', currentLoan: null } },
      inSession(session),
    );

    const fines = [];
    if (overdueCalc?.amount > 0) {
      const fine = await fineService.createFine({
        user: loan.user, loan: loan._id, resource: loan.resource, copy: loan.copy,
        fineType: 'overdue', amount: overdueCalc.amount,
        reason: `${overdueCalc.chargeableDays} chargeable day(s) overdue`,
        daysOverdue: overdueDays, createdBy: actor._id,
      }, session);
      if (fine) fines.push(fine);
    }
    if (lostCalc) {
      const fine = await fineService.createFine({
        user: loan.user, loan: loan._id, resource: loan.resource, copy: loan.copy,
        fineType: 'lost', amount: lostCalc.amount,
        reason: reason || lostCalc.reason, createdBy: actor._id,
      }, session);
      if (fine) fines.push(fine);
    }

    await User.updateOne({ _id: loan.user }, { $inc: { activeLoanCount: -1 } }, inSession(session));
    await resourceService.syncAvailability(loan.resource, session);
    return { fines };
  });

  await userService.refreshUserCounters(loan.user);
  await auditService.record({
    ...context, actor, action: 'loan_marked_lost', entityType: 'Loan', entityId: loan._id,
    entityLabel: loan.transactionId,
    newValue: { reason, fines: result.fines.map((f) => ({ code: f.fineCode, amount: f.amount })) },
  });

  // Only mention a charge (and link to fines) when one was actually raised.
  const charged = result.fines.length > 0;
  await notificationService.notify({
    user: loan.user,
    type: charged ? 'fine_created' : 'system',
    title: 'Item reported lost',
    message: `"${resource?.title}" has been recorded as lost.`
      + (charged ? ' A replacement charge has been added to your account.' : ''),
    severity: 'critical',
    entityType: 'Loan',
    entityId: loan._id,
    link: charged ? '/my-fines' : '/my-borrowing',
  });

  return { loan: await Loan.findById(loan._id).populate(LOAN_POPULATE), fines: result.fines };
}

function buildLoanFilter(query = {}) {
  const filter = compact({ user: query.user, resource: query.resource, copy: query.copy, issuedBy: query.issuedBy });

  if (query.status) filter.status = query.status;
  if (query.openOnly === true) filter.status = { $in: ['active', 'overdue'] };
  if (query.overdueOnly === true) {
    filter.status = { $in: ['active', 'overdue'] };
    filter.dueDate = { $lt: new Date() };
  }
  if (query.dueSoonDays) {
    filter.status = { $in: ['active', 'overdue'] };
    filter.dueDate = { $gte: new Date(), $lte: addDays(new Date(), Number(query.dueSoonDays)) };
  }

  const borrowed = dateRange(query.from, query.to);
  if (borrowed) filter.borrowDate = borrowed;
  if (query.returnedFrom || query.returnedTo) {
    const returned = dateRange(query.returnedFrom, query.returnedTo);
    if (returned) filter.returnDate = returned;
  }
  return filter;
}

async function listLoans(query = {}, options = {}) {
  const pagination = buildPagination(query, { defaultSort: '-borrowDate', ...options });
  return paginate(Loan, buildLoanFilter(query), pagination, { populate: LOAN_POPULATE });
}

async function getLoan(id) {
  const loan = await Loan.findById(id).populate(LOAN_POPULATE);
  if (!loan) throw ApiError.notFound('Loan not found');
  const renewals = await Renewal.find({ loan: id }).populate('renewedBy', 'firstName lastName').sort('-createdAt').lean();
  const fines = await require('../models/Fine').find({ loan: id }).lean();
  return { ...loan.toJSON(), renewals, fines };
}

async function listRenewals(query = {}) {
  const pagination = buildPagination(query, { defaultSort: '-createdAt' });
  const filter = compact({ user: query.user, loan: query.loan });
  const range = dateRange(query.from, query.to);
  if (range) filter.createdAt = range;
  return paginate(Renewal, filter, pagination, {
    populate: [
      { path: 'user', select: 'firstName lastName registrationNumber' },
      { path: 'loan', select: 'transactionId resource' },
      { path: 'renewedBy', select: 'firstName lastName' },
    ],
  });
}

/** Flags loans whose due date has passed. Idempotent; run nightly. */
async function markOverdueLoans() {
  const now = new Date();
  const result = await Loan.updateMany(
    { status: 'active', dueDate: { $lt: startOfDay(now) } },
    [{ $set: { status: 'overdue', daysOverdue: { $dateDiff: { startDate: '$dueDate', endDate: now, unit: 'day' } } } }],
  );
  return { updated: result.modifiedCount };
}

/** Desk snapshot: today's issues and returns plus the overdue backlog. */
async function deskSummary() {
  const from = startOfDay();
  const to = endOfDay();
  const [issuedToday, returnedToday, overdue, active, readyHolds] = await Promise.all([
    Loan.countDocuments({ borrowDate: { $gte: from, $lte: to } }),
    Loan.countDocuments({ returnDate: { $gte: from, $lte: to } }),
    Loan.countDocuments({ status: { $in: ['active', 'overdue'] }, dueDate: { $lt: new Date() } }),
    Loan.countDocuments({ status: { $in: ['active', 'overdue'] } }),
    Reservation.countDocuments({ status: 'ready' }),
  ]);
  return { issuedToday, returnedToday, overdue, active, readyHolds };
}

module.exports = {
  checkEligibility, issue, returnLoan, renew, markLost,
  listLoans, getLoan, listRenewals, markOverdueLoans, deskSummary,
  buildLoanFilter, LOAN_POPULATE,
};
