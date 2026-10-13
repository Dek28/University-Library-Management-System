const express = require('express');
const controller = require('../../controllers/purchaseOrder.controller');
const validate = require('../../middleware/validate');
const { authenticate, requirePermission } = require('../../middleware/auth');
const { idParam, objectId, optionalObjectId, paginationQuery, z } = require('../../validators/common.validator');
const { PURCHASE_ORDER_STATUS, PAYMENT_STATUS, PAYMENT_METHODS } = require('../../constants/enums');
const { P } = require('../../constants/permissions');

const router = express.Router();
router.use(authenticate);

const itemSchema = z.object({
  resource: optionalObjectId,
  title: z.string().trim().max(300).optional().default(''),
  authors: z.string().trim().max(300).optional().default(''),
  isbn: z.string().trim().max(20).optional().default(''),
  category: optionalObjectId,
  shelf: optionalObjectId,
  quantity: z.coerce.number().int().min(1).max(1000),
  unitPrice: z.coerce.number().min(0).optional().default(0),
}).refine((item) => Boolean(item.resource || item.title), {
  message: 'Choose a catalogue title or enter a title',
  path: ['title'],
});

const orderBody = z.object({
  supplier: z.string().trim().min(2).max(160),
  supplierContact: z.string().trim().max(200).optional().default(''),
  supplierAddress: z.string().trim().max(300).optional().default(''),
  expectedDate: z.coerce.date().optional().nullable(),
  notes: z.string().trim().max(1000).optional().default(''),
  discount: z.coerce.number().min(0).optional().default(0),
  taxRate: z.coerce.number().min(0).max(100).optional().default(0),
  shippingCost: z.coerce.number().min(0).optional().default(0),
  items: z.array(itemSchema).min(1, 'Add at least one book to the order').max(200),
});

const listQuery = paginationQuery.extend({
  status: z.enum(PURCHASE_ORDER_STATUS).optional(),
  paymentStatus: z.enum(PAYMENT_STATUS).optional(),
  search: z.string().trim().max(100).optional(),
  format: z.enum(['json', 'xlsx', 'pdf']).optional().default('json'),
});

const payBody = z.object({
  method: z.enum(PAYMENT_METHODS),
  reference: z.string().trim().max(120).optional().default(''),
  paidAt: z.coerce.date().optional(),
});

const invoiceQuery = z.object({ inline: z.enum(['true', 'false']).optional() });

const receiveBody = z.object({
  lines: z.array(z.object({
    item: objectId,
    quantity: z.coerce.number().int().min(1).max(1000),
    shelf: optionalObjectId,
  })).min(1, 'Enter a received quantity for at least one line'),
});

const cancelBody = z.object({ reason: z.string().trim().max(300).optional().default('') });

router.get('/summary', requirePermission(P.INVENTORY_VIEW), controller.summary);
router.get('/', requirePermission(P.INVENTORY_VIEW), validate({ query: listQuery }), controller.list);
router.post('/', requirePermission(P.INVENTORY_MANAGE), validate({ body: orderBody }), controller.create);
router.get('/:id', requirePermission(P.INVENTORY_VIEW), validate({ params: idParam() }), controller.getOne);
router.get(
  '/:id/invoice',
  requirePermission(P.INVENTORY_VIEW),
  validate({ params: idParam(), query: invoiceQuery }),
  controller.invoice,
);
router.post(
  '/:id/pay',
  requirePermission(P.INVENTORY_MANAGE),
  validate({ params: idParam(), body: payBody }),
  controller.pay,
);
router.patch(
  '/:id',
  requirePermission(P.INVENTORY_MANAGE),
  validate({ params: idParam(), body: orderBody.partial() }),
  controller.update,
);
router.post('/:id/place', requirePermission(P.INVENTORY_MANAGE), validate({ params: idParam() }), controller.place);
router.post(
  '/:id/receive',
  requirePermission(P.INVENTORY_MANAGE),
  validate({ params: idParam(), body: receiveBody }),
  controller.receive,
);
router.post(
  '/:id/cancel',
  requirePermission(P.INVENTORY_MANAGE),
  validate({ params: idParam(), body: cancelBody }),
  controller.cancel,
);

module.exports = router;