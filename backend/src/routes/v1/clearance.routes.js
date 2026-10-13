const express = require('express');
const controller = require('../../controllers/clearance.controller');
const validate = require('../../middleware/validate');
const { authenticate, requirePermission, requireAnyPermission } = require('../../middleware/auth');
const { idParam, objectId, paginationQuery, dateRangeQuery, z } = require('../../validators/common.validator');
const { CLEARANCE_STATUS } = require('../../constants/enums');
const { P } = require('../../constants/permissions');

const router = express.Router();
router.use(authenticate);

const listQuery = paginationQuery.merge(dateRangeQuery).extend({
  status: z.enum(CLEARANCE_STATUS).optional(),
  user: objectId.optional(),
  department: objectId.optional(),
  format: z.enum(['json', 'xlsx', 'csv', 'pdf']).optional().default('json'),
});

const checkQuery = z.object({
  userId: objectId.optional(),
  identifier: z.string().trim().min(2).optional(),
}).refine((d) => d.userId || d.identifier, {
  message: 'Provide a member id or identifier',
  path: ['identifier'],
});

const approveSchema = z.object({
  comments: z.string().trim().max(500).optional().default(''),
  override: z.boolean().optional().default(false),
  overrideReason: z.string().trim().max(500).optional(),
});

const rejectSchema = z.object({
  reason: z.string().trim().min(5, 'A reason is required').max(500),
});

router.get('/my-status', requirePermission(P.CLEARANCE_VIEW_OWN), controller.getOwn);
router.post('/request', requirePermission(P.CLEARANCE_REQUEST_OWN), controller.requestOwn);

router.get('/statistics', requirePermission(P.CLEARANCE_VIEW), controller.statistics);
router.get('/check', requirePermission(P.CLEARANCE_VIEW), validate({ query: checkQuery }), controller.check);

router.get('/', requirePermission(P.CLEARANCE_VIEW), validate({ query: listQuery }), controller.list);

router.post(
  '/',
  requirePermission(P.CLEARANCE_PROCESS),
  validate({ body: z.object({ user: objectId }) }),
  controller.requestForMember,
);

router.get('/:id', requirePermission(P.CLEARANCE_VIEW), validate({ params: idParam() }), controller.getOne);

router.get(
  '/:id/certificate',
  requireAnyPermission(P.CLEARANCE_VIEW, P.CLEARANCE_VIEW_OWN),
  validate({ params: idParam() }),
  controller.certificate,
);

router.post(
  '/:id/approve',
  requirePermission(P.CLEARANCE_PROCESS),
  validate({ params: idParam(), body: approveSchema }),
  controller.approve,
);

router.post(
  '/:id/reject',
  requirePermission(P.CLEARANCE_PROCESS),
  validate({ params: idParam(), body: rejectSchema }),
  controller.reject,
);

module.exports = router;
