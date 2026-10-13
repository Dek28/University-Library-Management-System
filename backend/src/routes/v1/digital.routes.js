const express = require('express');
const controller = require('../../controllers/digital.controller');
const validate = require('../../middleware/validate');
const { authenticate, requirePermission } = require('../../middleware/auth');
const { documentUpload } = require('../../middleware/upload');
const { uploadLimiter } = require('../../middleware/security');
const { idParam } = require('../../validators/common.validator');
const schemas = require('../../validators/digital.validator');
const { P } = require('../../constants/permissions');

const router = express.Router();
router.use(authenticate);

router.get('/', requirePermission(P.DIGITAL_VIEW), validate({ query: schemas.listQuery }), controller.list);

router.post(
  '/',
  requirePermission(P.DIGITAL_UPLOAD),
  uploadLimiter,
  // Multer must run before validation so multipart text fields are parsed.
  documentUpload.single('file'),
  validate({ body: schemas.uploadSchema }),
  controller.upload,
);

router.get('/:id', requirePermission(P.DIGITAL_VIEW), validate({ params: idParam() }), controller.getOne);

router.get(
  '/:id/download',
  requirePermission(P.DIGITAL_VIEW),
  validate({ params: idParam(), query: schemas.downloadQuery }),
  controller.download,
);

router.get(
  '/:id/read',
  requirePermission(P.DIGITAL_VIEW),
  validate({ params: idParam() }),
  controller.read,
);

router.patch(
  '/:id',
  requirePermission(P.DIGITAL_MANAGE),
  validate({ params: idParam(), body: schemas.updateSchema }),
  controller.update,
);

router.delete('/:id', requirePermission(P.DIGITAL_MANAGE), validate({ params: idParam() }), controller.remove);

module.exports = router;
