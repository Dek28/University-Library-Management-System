const express = require('express');
const controller = require('../../controllers/notification.controller');
const validate = require('../../middleware/validate');
const { authenticate, requirePermission } = require('../../middleware/auth');
const { idParam, objectId, paginationQuery, booleanish, z } = require('../../validators/common.validator');
const { NOTIFICATION_TYPES } = require('../../constants/enums');
const { P } = require('../../constants/permissions');

const router = express.Router();
router.use(authenticate);

const listQuery = paginationQuery.extend({
  type: z.enum(NOTIFICATION_TYPES).optional(),
  isRead: booleanish.optional(),
});

const broadcastSchema = z.object({
  roleKey: z.string().max(40).optional(),
  userIds: z.array(objectId).max(2000).optional(),
  title: z.string().trim().min(3).max(160),
  message: z.string().trim().min(3).max(1000),
  severity: z.enum(['info', 'warning', 'critical']).optional(),
});

router.get('/', validate({ query: listQuery }), controller.list);
router.get('/unread-count', controller.unreadCount);
router.post('/read', validate({ body: z.object({ ids: z.array(objectId).min(1).max(200) }) }), controller.markRead);
router.post('/read-all', controller.markAllRead);
router.post('/broadcast', requirePermission(P.NOTIFICATION_BROADCAST), validate({ body: broadcastSchema }), controller.broadcast);
router.delete('/:id', validate({ params: idParam() }), controller.remove);

module.exports = router;
