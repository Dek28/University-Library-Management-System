const express = require('express');
const controller = require('../../controllers/inventory.controller');
const validate = require('../../middleware/validate');
const { authenticate, requirePermission } = require('../../middleware/auth');
const { idParam, objectId, paginationQuery, z } = require('../../validators/common.validator');
const { COPY_STATUS, COPY_CONDITION } = require('../../constants/enums');
const { P } = require('../../constants/permissions');

const router = express.Router();
router.use(authenticate);

const startAuditSchema = z.object({
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().max(500).optional().default(''),
  shelf: objectId.optional(),
  category: objectId.optional(),
});

const recordItemSchema = z.object({
  identifier: z.string().trim().min(1),
  foundStatus: z.enum(['found', 'missing', 'damaged', 'misplaced']),
  condition: z.enum(COPY_CONDITION).optional(),
  remark: z.string().trim().max(300).optional().default(''),
});

const completeSchema = z.object({
  applyAdjustments: z.boolean().optional().default(true),
  notes: z.string().trim().max(500).optional().default(''),
});

const adjustSchema = z.object({
  status: z.enum(['available', 'damaged', 'lost', 'missing', 'withdrawn', 'under_repair', 'reference_only']),
  condition: z.enum(COPY_CONDITION).optional(),
  reason: z.string().trim().min(3).max(300),
});

router.get('/summary', requirePermission(P.INVENTORY_VIEW), controller.summary);

router.get(
  '/copies/:status',
  requirePermission(P.INVENTORY_VIEW),
  validate({ params: z.object({ status: z.enum(COPY_STATUS) }), query: paginationQuery.extend({ shelf: objectId.optional() }) }),
  controller.copiesByStatus,
);

router.patch(
  '/copies/:copyId/adjust',
  requirePermission(P.INVENTORY_MANAGE),
  validate({ params: z.object({ copyId: objectId }), body: adjustSchema }),
  controller.adjustCopy,
);

router.get('/audits', requirePermission(P.INVENTORY_VIEW), controller.listAudits);
router.post('/audits', requirePermission(P.INVENTORY_MANAGE), validate({ body: startAuditSchema }), controller.startAudit);
router.get('/audits/:id', requirePermission(P.INVENTORY_VIEW), validate({ params: idParam() }), controller.getAudit);

router.post(
  '/audits/:id/items',
  requirePermission(P.INVENTORY_MANAGE),
  validate({ params: idParam(), body: recordItemSchema }),
  controller.recordItem,
);

router.post(
  '/audits/:id/complete',
  requirePermission(P.INVENTORY_MANAGE),
  validate({ params: idParam(), body: completeSchema }),
  controller.completeAudit,
);

router.post(
  '/audits/:id/cancel',
  requirePermission(P.INVENTORY_MANAGE),
  validate({ params: idParam(), body: z.object({ reason: z.string().trim().max(300).optional().default('') }) }),
  controller.cancelAudit,
);

module.exports = router;
