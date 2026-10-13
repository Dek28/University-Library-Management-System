const express = require('express');
const controller = require('../../controllers/resource.controller');
const validate = require('../../middleware/validate');
const { authenticate, requirePermission } = require('../../middleware/auth');
const { imageUpload, spreadsheetUpload } = require('../../middleware/upload');
const { uploadLimiter } = require('../../middleware/security');
const { idParam } = require('../../validators/common.validator');
const schemas = require('../../validators/resource.validator');
const { P } = require('../../constants/permissions');

const router = express.Router();
router.use(authenticate);

router.get('/suggest', requirePermission(P.RESOURCE_VIEW), validate({ query: schemas.suggestQuery }), controller.suggest);
router.get('/discovery', requirePermission(P.RESOURCE_VIEW), controller.discovery);

// Bulk import. Static paths are declared before "/:id" so they are not read as ids.
router.get('/import/template', requirePermission(P.RESOURCE_CREATE), controller.importTemplate);
router.post(
  '/import/inspect',
  requirePermission(P.RESOURCE_CREATE),
  uploadLimiter,
  spreadsheetUpload.single('file'),
  controller.inspectImport,
);
router.post(
  '/import',
  requirePermission(P.RESOURCE_CREATE),
  uploadLimiter,
  spreadsheetUpload.single('file'),
  validate({ body: schemas.importBody }),
  controller.importResources,
);

router.get('/', requirePermission(P.RESOURCE_VIEW), validate({ query: schemas.searchQuery }), controller.search);
router.post('/', requirePermission(P.RESOURCE_CREATE), validate({ body: schemas.resourceBody }), controller.create);

router.get('/:id', requirePermission(P.RESOURCE_VIEW), validate({ params: idParam(), query: schemas.detailQuery }), controller.getOne);
router.get('/:id/related', requirePermission(P.RESOURCE_VIEW), validate({ params: idParam() }), controller.getRelated);

router.patch(
  '/:id',
  requirePermission(P.RESOURCE_UPDATE),
  validate({ params: idParam(), body: schemas.resourceUpdateBody }),
  controller.update,
);

router.post(
  '/:id/cover',
  requirePermission(P.RESOURCE_UPDATE),
  uploadLimiter,
  imageUpload.single('cover'),
  validate({ params: idParam() }),
  controller.uploadCover,
);

router.delete('/:id', requirePermission(P.RESOURCE_DELETE), validate({ params: idParam() }), controller.remove);

module.exports = router;
