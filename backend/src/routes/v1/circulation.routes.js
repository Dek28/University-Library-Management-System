const express = require('express');
const controller = require('../../controllers/circulation.controller');
const validate = require('../../middleware/validate');
const { authenticate, requirePermission, requireAnyPermission } = require('../../middleware/auth');
const { idParam } = require('../../validators/common.validator');
const schemas = require('../../validators/circulation.validator');
const { P } = require('../../constants/permissions');

const router = express.Router();
router.use(authenticate);

router.get('/desk-summary', requirePermission(P.LOAN_VIEW), controller.deskSummary);
router.get('/eligibility', requirePermission(P.LOAN_ISSUE), validate({ query: schemas.eligibilityQuery }), controller.eligibility);

router.post('/issue', requirePermission(P.LOAN_ISSUE), validate({ body: schemas.issueSchema }), controller.issue);
router.post('/return', requirePermission(P.LOAN_RETURN), validate({ body: schemas.returnSchema }), controller.returnItem);

// Members may list their own loans; the controller narrows the filter.
router.get(
  '/',
  requireAnyPermission(P.LOAN_VIEW, P.LOAN_VIEW_OWN),
  validate({ query: schemas.loanListQuery }),
  controller.listLoans,
);

router.get(
  '/renewals',
  requireAnyPermission(P.LOAN_VIEW, P.LOAN_VIEW_OWN),
  controller.listRenewals,
);

router.get('/:id', requireAnyPermission(P.LOAN_VIEW, P.LOAN_VIEW_OWN), validate({ params: idParam() }), controller.getLoan);
router.get('/:id/receipt', requireAnyPermission(P.LOAN_VIEW, P.LOAN_VIEW_OWN), validate({ params: idParam() }), controller.receipt);

router.post(
  '/:id/renew',
  requireAnyPermission(P.LOAN_RENEW, P.LOAN_RENEW_OWN),
  validate({ params: idParam(), body: schemas.renewSchema }),
  controller.renew,
);

router.post(
  '/:id/lost',
  requirePermission(P.LOAN_MARK_LOST),
  validate({ params: idParam(), body: schemas.markLostSchema }),
  controller.markLost,
);

module.exports = router;
