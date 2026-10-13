const express = require('express');
const controller = require('../../controllers/copy.controller');
const validate = require('../../middleware/validate');
const { authenticate, requirePermission } = require('../../middleware/auth');
const { idParam, z } = require('../../validators/common.validator');
const schemas = require('../../validators/resource.validator');
const { P } = require('../../constants/permissions');

const router = express.Router();
router.use(authenticate);

router.get(
  '/lookup',
  requirePermission(P.RESOURCE_VIEW),
  validate({ query: z.object({ identifier: z.string().trim().min(1) }) }),
  controller.lookup,
);

router.get('/', requirePermission(P.RESOURCE_VIEW), validate({ query: schemas.copyListQuery }), controller.list);
router.post('/', requirePermission(P.COPY_MANAGE), validate({ body: schemas.copyBody }), controller.create);
router.post('/batch', requirePermission(P.COPY_MANAGE), validate({ body: schemas.copyBatchBody }), controller.createBatch);

router.get('/:id', requirePermission(P.RESOURCE_VIEW), validate({ params: idParam() }), controller.getOne);
router.patch('/:id', requirePermission(P.COPY_MANAGE), validate({ params: idParam(), body: schemas.copyUpdateBody }), controller.update);
router.delete('/:id', requirePermission(P.COPY_MANAGE), validate({ params: idParam() }), controller.remove);

module.exports = router;
