const express = require('express');
const controller = require('../../controllers/report.controller');
const validate = require('../../middleware/validate');
const { authenticate, requirePermission } = require('../../middleware/auth');
const { z, objectId, dateRangeQuery } = require('../../validators/common.validator');
const { P } = require('../../constants/permissions');

const router = express.Router();
router.use(authenticate, requirePermission(P.REPORT_VIEW));

const runQuery = dateRangeQuery.extend({
  format: z.enum(['json', 'xlsx', 'csv', 'pdf']).optional().default('json'),
  status: z.string().max(40).optional(),
  kind: z.string().max(40).optional(),
  user: objectId.optional(),
  resource: objectId.optional(),
  group: objectId.optional(),
  department: objectId.optional(),
  search: z.string().max(120).optional(),
});

router.get('/', controller.list);
router.get('/overview', validate({ query: dateRangeQuery }), controller.overview);
router.get(
  '/:key',
  validate({ params: z.object({ key: z.string().regex(/^[a-z-]+$/) }), query: runQuery }),
  controller.run,
);

module.exports = router;
