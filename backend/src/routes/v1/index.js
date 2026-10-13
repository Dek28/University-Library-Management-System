const express = require('express');
const { settingsRouter, rolesRouter, auditRouter } = require('./admin.routes');

const router = express.Router();

router.use('/auth', require('./auth.routes'));
router.use('/users', require('./user.routes'));
router.use('/reference', require('./reference.routes'));
router.use('/authors', require('./author.routes'));
router.use('/resources', require('./resource.routes'));
router.use('/resource-copies', require('./copy.routes'));
router.use('/loans', require('./circulation.routes'));
router.use('/reservations', require('./reservation.routes'));
router.use('/fines', require('./fine.routes'));
router.use('/digital-resources', require('./digital.routes'));
router.use('/inventory', require('./inventory.routes'));
router.use('/purchase-orders', require('./purchaseOrder.routes'));
router.use('/clearance', require('./clearance.routes'));
router.use('/reading-groups', require('./readingGroup.routes'));
router.use('/dashboard', require('./dashboard.routes'));
router.use('/reports', require('./report.routes'));
router.use('/notifications', require('./notification.routes'));
router.use('/settings', settingsRouter);
router.use('/roles', rolesRouter);
router.use('/audit-logs', auditRouter);

router.get('/', (req, res) => res.json({
  success: true,
  message: 'ULMS API v1',
  data: {
    version: '1.0.0',
    documentation: '/api-docs',
    endpoints: [
      'auth', 'users', 'reference', 'authors', 'resources', 'resource-copies',
      'loans', 'reservations', 'fines', 'digital-resources', 'inventory', 'purchase-orders',
      'clearance', 'reading-groups', 'dashboard', 'reports', 'notifications',
      'settings', 'roles', 'audit-logs',
    ],
  },
}));

module.exports = router;
