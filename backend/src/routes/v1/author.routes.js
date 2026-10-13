const express = require('express');
const controller = require('../../controllers/author.controller');
const validate = require('../../middleware/validate');
const { authenticate, requirePermission } = require('../../middleware/auth');
const { idParam, paginationQuery, booleanish, z } = require('../../validators/common.validator');
const { P } = require('../../constants/permissions');

const router = express.Router();
router.use(authenticate);

const listQuery = paginationQuery.extend({
  isActive: booleanish.optional(),
  nationality: z.string().optional(),
});

router.get('/', requirePermission(P.RESOURCE_VIEW), validate({ query: listQuery }), controller.list);
router.get('/:id', requirePermission(P.RESOURCE_VIEW), validate({ params: idParam(), query: paginationQuery }), controller.getOne);

module.exports = router;
