const catchAsync = require('../utils/catchAsync');
const { ok, created, paginated } = require('../utils/response');
const ApiError = require('../utils/ApiError');
const reservationService = require('../services/reservation.service');
const { has } = require('../middleware/auth');
const { P } = require('../constants/permissions');

const list = catchAsync(async (req, res) => {
  const query = { ...req.query };
  if (!has(req, P.RESERVATION_VIEW)) query.user = String(req.user._id);
  const result = await reservationService.list(query);
  return paginated(res, { items: result.items, page: result.page, limit: result.limit, total: result.total });
});

const getOne = catchAsync(async (req, res) => {
  const reservation = await reservationService.getById(req.params.id);
  if (!has(req, P.RESERVATION_VIEW) && String(reservation.user?._id || reservation.user) !== String(req.user._id)) {
    throw ApiError.forbidden();
  }
  const position = await reservationService.queuePosition(reservation);
  return ok(res, { message: 'Reservation loaded', data: { ...reservation.toJSON(), queuePosition: position } });
});

const create = catchAsync(async (req, res) => {
  // Only staff with the manage permission may reserve on someone else's behalf.
  const targetUser = req.body.user && has(req, P.RESERVATION_MANAGE) ? req.body.user : String(req.user._id);
  const reservation = await reservationService.create(
    { ...req.body, user: targetUser },
    req.user,
    { req },
  );
  return created(res, { message: 'Reservation placed successfully', data: reservation });
});

const cancel = catchAsync(async (req, res) => {
  const reservation = await reservationService.getById(req.params.id);
  const isOwner = String(reservation.user?._id || reservation.user) === String(req.user._id);
  if (!isOwner && !has(req, P.RESERVATION_MANAGE)) throw ApiError.forbidden();

  const updated = await reservationService.cancel(req.params.id, req.body, req.user, { req });
  return ok(res, { message: 'Reservation cancelled', data: updated });
});

const expireStale = catchAsync(async (req, res) =>
  ok(res, { message: 'Expiry sweep complete', data: await reservationService.expireStaleReservations() }));

module.exports = { list, getOne, create, cancel, expireStale };
