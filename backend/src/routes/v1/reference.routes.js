const express = require('express');
const controller = require('../../controllers/reference.controller');
const validate = require('../../middleware/validate');
const { authenticate, requirePermission } = require('../../middleware/auth');
const schemas = require('../../validators/reference.validator');
const { P } = require('../../constants/permissions');

const router = express.Router();
router.use(authenticate);

router.get('/', requirePermission(P.REFERENCE_VIEW), controller.listCollections);

router.get(
  '/:collection',
  requirePermission(P.REFERENCE_VIEW),
  validate({ params: schemas.collectionParam, query: schemas.listQuery }),
  controller.list,
);

router.post(
  '/:collection',
  requirePermission(P.REFERENCE_MANAGE),
  validate({ params: schemas.collectionParam, body: schemas.referenceBody }),
  controller.create,
);

router.get(
  '/:collection/:id',
  requirePermission(P.REFERENCE_VIEW),
  validate({ params: schemas.collectionParam }),
  controller.getOne,
);

router.patch(
  '/:collection/:id',
  requirePermission(P.REFERENCE_MANAGE),
  validate({ params: schemas.collectionParam, body: schemas.referenceUpdateBody }),
  controller.update,
);

router.delete(
  '/:collection/:id',
  requirePermission(P.REFERENCE_MANAGE),
  validate({ params: schemas.collectionParam }),
  controller.remove,
);

module.exports = router;
