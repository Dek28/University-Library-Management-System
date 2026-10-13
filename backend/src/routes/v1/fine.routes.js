const express = require('express');
const controller = require('../../controllers/fine.controller');
const validate = require('../../middleware/validate');
const { authenticate, requirePermission, requireAnyPermission } = require('../../middleware/auth');
const { idParam, objectId, z } = require('../../validators/common.validator');
const schemas = require('../../validators/circulation.validator');
const { P } = require('../../constants/permissions');

const router = express.Router();
router.use(authenticate);

router.get('/summary', requirePermission(P.FINE_VIEW), controller.summary);
router.get('/payments', requireAnyPermission(P.FINE_VIEW, P.FINE_VIEW_OWN), controller.payments);
router.get('/my-outstanding', requirePermission(P.FINE_VIEW_OWN), controller.myOutstanding);

router.get(
  '/user/:userId/outstanding',
  requirePermission(P.FINE_VIEW),
  validate({ params: z.object({ userId: objectId }) }),
  controller.outstandingForUser,
);

router.get('/', requireAnyPermission(P.FINE_VIEW, P.FINE_VIEW_OWN), validate({ query: schemas.fineListQuery }), controller.list);
router.post('/', requirePermission(P.FINE_CREATE), validate({ body: schemas.manualFineSchema }), controller.createManual);

router.get('/:id', requireAnyPermission(P.FINE_VIEW, P.FINE_VIEW_OWN), validate({ params: idParam() }), controller.getOne);
router.get('/:id/receipt', requireAnyPermission(P.FINE_VIEW, P.FINE_VIEW_OWN), validate({ params: idParam() }), controller.receipt);

router.post('/:id/payments', requirePermission(P.FINE_PAY), validate({ params: idParam(), body: schemas.paymentSchema }), controller.pay);
router.post('/:id/waive', requirePermission(P.FINE_WAIVE), validate({ params: idParam(), body: schemas.waiveSchema }), controller.waive);
router.post('/:id/cancel', requirePermission(P.FINE_WAIVE), validate({ params: idParam(), body: schemas.cancelFineSchema }), controller.cancel);

module.exports = router;
