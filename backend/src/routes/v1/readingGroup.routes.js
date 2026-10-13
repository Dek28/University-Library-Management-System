const express = require('express');
const controller = require('../../controllers/readingGroup.controller');
const validate = require('../../middleware/validate');
const { authenticate, requirePermission, requireAnyPermission } = require('../../middleware/auth');
const { idParam, z } = require('../../validators/common.validator');
const schemas = require('../../validators/readingGroup.validator');
const { P } = require('../../constants/permissions');

const router = express.Router();
router.use(authenticate);

const VIEW = [P.GROUP_VIEW, P.GROUP_VIEW_OWN];

router.get('/schedule', requireAnyPermission(...VIEW), validate({ query: schemas.scheduleQuery }), controller.schedule);
router.get('/statistics', requirePermission(P.GROUP_VIEW), controller.statistics);

router.get('/sessions', requireAnyPermission(...VIEW), validate({ query: schemas.sessionListQuery }), controller.listSessions);
router.post('/sessions', requirePermission(P.GROUP_MANAGE), validate({ body: schemas.sessionBody }), controller.scheduleSession);
router.get('/sessions/:id', requireAnyPermission(...VIEW), validate({ params: idParam() }), controller.getSession);

router.patch(
  '/sessions/:id',
  requirePermission(P.GROUP_MANAGE),
  validate({ params: idParam(), body: schemas.sessionUpdateBody }),
  controller.updateSession,
);

router.post(
  '/sessions/:id/cancel',
  requirePermission(P.GROUP_MANAGE),
  validate({ params: idParam(), body: z.object({ reason: z.string().trim().max(300).optional().default('') }) }),
  controller.cancelSession,
);

router.post(
  '/sessions/:id/attendance',
  requirePermission(P.GROUP_ATTENDANCE),
  validate({ params: idParam(), body: schemas.attendanceBody }),
  controller.recordAttendance,
);

router.get('/', requireAnyPermission(...VIEW), validate({ query: schemas.groupListQuery }), controller.listGroups);
router.post('/', requirePermission(P.GROUP_MANAGE), validate({ body: schemas.groupBody }), controller.createGroup);

router.get('/:id', requireAnyPermission(...VIEW), validate({ params: idParam() }), controller.getGroup);
router.patch('/:id', requirePermission(P.GROUP_MANAGE), validate({ params: idParam(), body: schemas.groupUpdateBody }), controller.updateGroup);
router.post('/:id/members', requirePermission(P.GROUP_MANAGE), validate({ params: idParam(), body: schemas.membersBody }), controller.setMembers);
router.delete('/:id', requirePermission(P.GROUP_MANAGE), validate({ params: idParam() }), controller.removeGroup);

module.exports = router;
