const express = require('express');
const controller = require('../../controllers/dashboard.controller');
const { authenticate, requirePermission } = require('../../middleware/auth');
const { P } = require('../../constants/permissions');

const router = express.Router();
router.use(authenticate);

router.get('/admin', requirePermission(P.DASHBOARD_ADMIN), controller.admin);
router.get('/librarian', requirePermission(P.DASHBOARD_LIBRARIAN), controller.librarian);
router.get('/me', requirePermission(P.DASHBOARD_SELF), controller.self);

module.exports = router;
