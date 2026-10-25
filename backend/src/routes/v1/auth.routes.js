const express = require('express');
const controller = require('../../controllers/auth.controller');
const validate = require('../../middleware/validate');
const { authenticate } = require('../../middleware/auth');
const { authLimiter, loginLimiter, refreshLimiter } = require('../../middleware/security');
const schemas = require('../../validators/auth.validator');

const router = express.Router();

router.post('/login', loginLimiter, validate({ body: schemas.loginSchema }), controller.login);
router.post('/refresh', refreshLimiter, controller.refresh);
router.post('/logout', refreshLimiter, controller.logout);
router.post('/forgot-password', authLimiter, validate({ body: schemas.forgotPasswordSchema }), controller.forgotPassword);
router.post('/reset-password', authLimiter, validate({ body: schemas.resetPasswordSchema }), controller.resetPassword);

router.get('/me', authenticate, controller.me);
router.post('/change-password', authenticate, validate({ body: schemas.changePasswordSchema }), controller.changePassword);
router.post('/revoke-sessions', authenticate, controller.revokeAllSessions);

module.exports = router;
