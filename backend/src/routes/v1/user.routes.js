const express = require('express');
const controller = require('../../controllers/user.controller');
const validate = require('../../middleware/validate');
const { authenticate, requirePermission } = require('../../middleware/auth');
const { spreadsheetUpload } = require('../../middleware/upload');
const { uploadLimiter } = require('../../middleware/security');
const { idParam } = require('../../validators/common.validator');
const schemas = require('../../validators/user.validator');
const { P } = require('../../constants/permissions');

const router = express.Router();
router.use(authenticate);

// Self-service profile update. No elevated permission needed.
router.patch('/me/profile', controller.updateOwnProfile);

router.get('/import/template', requirePermission(P.USER_IMPORT), controller.importTemplate);
router.post(
  '/import',
  requirePermission(P.USER_IMPORT),
  uploadLimiter,
  spreadsheetUpload.single('file'),
  validate({ query: schemas.importQuery }),
  controller.importUsers,
);

router.get('/lookup', requirePermission(P.USER_VIEW), validate({ query: schemas.lookupQuery }), controller.lookup);

router.get('/', requirePermission(P.USER_VIEW), validate({ query: schemas.listUsersQuery }), controller.list);
router.post('/', requirePermission(P.USER_CREATE), validate({ body: schemas.createUserSchema }), controller.create);

router.get('/:id', requirePermission(P.USER_VIEW), validate({ params: idParam() }), controller.getOne);
router.get('/:id/activity', requirePermission(P.USER_VIEW), validate({ params: idParam() }), controller.getActivity);

router.patch(
  '/:id',
  requirePermission(P.USER_UPDATE),
  validate({ params: idParam(), body: schemas.updateUserSchema }),
  controller.update,
);

router.patch(
  '/:id/status',
  requirePermission(P.USER_STATUS),
  validate({ params: idParam(), body: schemas.changeStatusSchema }),
  controller.changeStatus,
);

router.post(
  '/:id/reset-password',
  requirePermission(P.USER_STATUS),
  validate({ params: idParam(), body: schemas.adminResetPasswordSchema }),
  controller.resetPassword,
);

router.delete('/:id', requirePermission(P.USER_STATUS), validate({ params: idParam() }), controller.remove);

module.exports = router;
