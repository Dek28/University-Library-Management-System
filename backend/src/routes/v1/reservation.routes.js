const express = require('express');
const controller = require('../../controllers/reservation.controller');
const validate = require('../../middleware/validate');
const { authenticate, requirePermission, requireAnyPermission } = require('../../middleware/auth');
const { idParam } = require('../../validators/common.validator');
const schemas = require('../../validators/circulation.validator');
const { P } = require('../../constants/permissions');

const router = express.Router();
router.use(authenticate);

router.get(
  '/',
  requireAnyPermission(P.RESERVATION_VIEW, P.RESERVATION_CREATE_OWN),
  validate({ query: schemas.reservationListQuery }),
  controller.list,
);

router.post(
  '/',
  requireAnyPermission(P.RESERVATION_MANAGE, P.RESERVATION_CREATE_OWN),
  validate({ body: schemas.reservationCreateSchema }),
  controller.create,
);

router.post('/expire-stale', requirePermission(P.RESERVATION_MANAGE), controller.expireStale);

router.get(
  '/:id',
  requireAnyPermission(P.RESERVATION_VIEW, P.RESERVATION_CREATE_OWN),
  validate({ params: idParam() }),
  controller.getOne,
);

router.post(
  '/:id/cancel',
  requireAnyPermission(P.RESERVATION_MANAGE, P.RESERVATION_CREATE_OWN),
  validate({ params: idParam(), body: schemas.reservationCancelSchema }),
  controller.cancel,
);

module.exports = router;
