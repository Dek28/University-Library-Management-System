const Reservation = require('../models/Reservation');
const Resource = require('../models/Resource');
const ResourceCopy = require('../models/ResourceCopy');
const Loan = require('../models/Loan');
const ApiError = require('../utils/ApiError');
const auditService = require('./audit.service');
const settingsService = require('./settings.service');
const notificationService = require('./notification.service');
const { buildPagination, paginate, compact } = require('../utils/query');
const { reservationCode } = require('../utils/identifiers');
const { addDays } = require('../utils/datetime');
const { inSession } = require('../utils/transaction');

const POPULATE = [
  { path: 'user', select: 'firstName lastName email registrationNumber employeeId' },
  { path: 'resource', select: 'title resourceType coverImage availableCopies totalCopies' },
  { path: 'copy', select: 'accessionNumber barcode' },
];

async function list(query = {}) {
  const pagination = buildPagination(query, { defaultSort: '-createdAt' });
  const filter = compact({ user: query.user, resource: query.resource, status: query.status });
  if (query.activeOnly === true) filter.status = { $in: ['pending', 'ready'] };
  return paginate(Reservation, filter, pagination, { populate: POPULATE });
}

async function getById(id) {
  const reservation = await Reservation.findById(id).populate(POPULATE);
  if (!reservation) throw ApiError.notFound('Reservation not found');
  return reservation;
}

/** 1-based position of a pending reservation in its title's queue. */
async function queuePosition(reservation) {
  if (reservation.status !== 'pending') return 0;
  const ahead = await Reservation.countDocuments({
    resource: reservation.resource,
    status: 'pending',
    createdAt: { $lt: reservation.createdAt },
  });
  return ahead + 1;
}

/**
 * Places a hold.
 *
 * Holds only make sense when nothing is on the shelf: if a copy is available
 * the member is told to borrow it directly, which keeps the queue meaningful.
 */
async function create({ resource: resourceId, user: userId, notes }, actor, context = {}) {
  const resource = await Resource.findById(resourceId);
  if (!resource) throw ApiError.notFound('Catalogue record not found');
  if (!resource.isBorrowable || resource.isReferenceOnly) {
    throw ApiError.badRequest('This resource cannot be reserved');
  }

  const alreadyOnLoan = await Loan.exists({
    user: userId, resource: resourceId, status: { $in: ['active', 'overdue'] },
  });
  if (alreadyOnLoan) throw ApiError.conflict('You already have a copy of this title on loan');

  const existing = await Reservation.findOne({
    user: userId, resource: resourceId, status: { $in: ['pending', 'ready'] },
  });
  if (existing) throw ApiError.conflict('You already have an open reservation for this title');

  if (resource.availableCopies > 0) {
    throw ApiError.badRequest('Copies of this title are on the shelf, so it can be borrowed immediately');
  }

  const reservation = await Reservation.create({
    reservationCode: reservationCode(),
    user: userId,
    resource: resourceId,
    status: 'pending',
    createdBy: actor?._id || userId,
    notes: notes || '',
  });

  reservation.queuePosition = await queuePosition(reservation);
  await reservation.save();

  await auditService.record({
    ...context, actor, action: 'reservation_created', entityType: 'Reservation', entityId: reservation._id,
    entityLabel: reservation.reservationCode,
    description: `Hold placed on "${resource.title}" (position ${reservation.queuePosition})`,
  });

  return getById(reservation._id);
}

async function cancel(id, { reason }, actor, context = {}) {
  const reservation = await Reservation.findById(id);
  if (!reservation) throw ApiError.notFound('Reservation not found');
  if (!['pending', 'ready'].includes(reservation.status)) {
    throw ApiError.badRequest(`This reservation is already ${reservation.status}`);
  }

  const releasedCopy = reservation.copy;

  reservation.status = 'cancelled';
  reservation.cancelledAt = new Date();
  reservation.cancelledBy = actor?._id || null;
  reservation.cancelReason = reason || '';
  await reservation.save();

  // A held copy must go back to the shelf, or on to the next in the queue.
  if (releasedCopy) {
    await ResourceCopy.updateOne({ _id: releasedCopy, status: 'reserved' }, { $set: { status: 'available' } });
    await require('./resource.service').syncAvailability(reservation.resource);
    await allocateNext(reservation.resource, releasedCopy, actor);
  }

  await auditService.record({
    ...context, actor, action: 'reservation_cancelled', entityType: 'Reservation', entityId: reservation._id,
    entityLabel: reservation.reservationCode, description: reason || 'Cancelled',
  });

  await notificationService.notify({
    user: reservation.user,
    type: 'reservation_cancelled',
    title: 'Reservation cancelled',
    message: `Your reservation ${reservation.reservationCode} was cancelled.${reason ? ` Reason: ${reason}` : ''}`,
    entityType: 'Reservation',
    entityId: reservation._id,
    link: '/my-reservations',
  });

  return getById(id);
}

/**
 * Hands a freed copy to the next member in the queue and notifies them.
 * Returns the promoted reservation, or null when nobody is waiting.
 */
async function allocateNext(resourceId, copyId, actor, session = null) {
  const next = await Reservation.findOne({ resource: resourceId, status: 'pending' })
    .sort('createdAt')
    .setOptions(inSession(session));
  if (!next) return null;

  const settings = await settingsService.getSettings();
  const expiresAt = addDays(new Date(), settings.circulation.reservationExpiryDays);

  next.status = 'ready';
  next.copy = copyId;
  next.readyAt = new Date();
  next.expiresAt = expiresAt;
  next.queuePosition = 0;
  await next.save(inSession(session));

  await ResourceCopy.updateOne({ _id: copyId }, { $set: { status: 'reserved' } }, inSession(session));

  const resource = await Resource.findById(resourceId).select('title').setOptions(inSession(session));
  await notificationService.notify({
    user: next.user,
    type: 'reservation_ready',
    title: 'Your reserved item is ready for collection',
    message: `"${resource?.title}" is being held for you until ${expiresAt.toISOString().slice(0, 10)}. `
      + 'Collect it from the circulation desk before then.',
    severity: 'warning',
    entityType: 'Reservation',
    entityId: next._id,
    link: '/my-reservations',
  });

  await auditService.record({
    actor, action: 'reservation_fulfilled', entityType: 'Reservation', entityId: next._id,
    entityLabel: next.reservationCode, description: 'Copy allocated and member notified',
  });

  return next;
}

/** Marks a reservation completed once the held copy is actually issued. */
async function markCompleted(reservationId, session = null) {
  return Reservation.updateOne(
    { _id: reservationId },
    { $set: { status: 'completed', fulfilledAt: new Date() } },
    inSession(session),
  );
}

/** Finds the ready-for-pickup hold a member holds on a title, if any. */
const findReadyFor = (userId, resourceId, session = null) =>
  Reservation.findOne({ user: userId, resource: resourceId, status: 'ready' }).setOptions(inSession(session));

/**
 * Expires holds whose collection window has passed and passes each copy to the
 * next member in line. Used by the nightly job and callable on demand.
 */
async function expireStaleReservations() {
  const expired = await Reservation.find({ status: 'ready', expiresAt: { $lt: new Date() } });
  const results = { expired: 0, reallocated: 0 };

  for (const reservation of expired) {
    reservation.status = 'expired';
    // eslint-disable-next-line no-await-in-loop
    await reservation.save();
    results.expired += 1;

    // eslint-disable-next-line no-await-in-loop
    await notificationService.notify({
      user: reservation.user,
      type: 'reservation_expired',
      title: 'Reservation expired',
      message: `Your reservation ${reservation.reservationCode} expired because it was not collected in time.`,
      entityType: 'Reservation',
      entityId: reservation._id,
      link: '/my-reservations',
    });

    if (reservation.copy) {
      // eslint-disable-next-line no-await-in-loop
      const promoted = await allocateNext(reservation.resource, reservation.copy, null);
      if (promoted) {
        results.reallocated += 1;
      } else {
        // eslint-disable-next-line no-await-in-loop
        await ResourceCopy.updateOne({ _id: reservation.copy, status: 'reserved' }, { $set: { status: 'available' } });
        // eslint-disable-next-line no-await-in-loop
        await require('./resource.service').syncAvailability(reservation.resource);
      }
    }
  }
  return results;
}

module.exports = {
  list, getById, create, cancel, allocateNext, markCompleted,
  findReadyFor, expireStaleReservations, queuePosition,
};
