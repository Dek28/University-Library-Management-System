const env = require('../config/env');
const catchAsync = require('../utils/catchAsync');
const { ok } = require('../utils/response');
const authService = require('../services/auth.service');
const tokenService = require('../services/token.service');

const readRefreshToken = (req) => req.cookies?.[env.jwt.refreshCookieName] || req.body?.refreshToken;

const login = catchAsync(async (req, res) => {
  const result = await authService.login(req.body, { req });
  tokenService.setRefreshCookie(res, result.refresh.token, result.refresh.expiresAt);
  return ok(res, {
    message: 'Signed in successfully',
    // The refresh token is also returned for non-browser clients that cannot
    // use cookies; browsers should rely on the HTTP-only cookie instead.
    data: { user: result.user, accessToken: result.accessToken, refreshToken: result.refresh.token },
  });
});

const refresh = catchAsync(async (req, res) => {
  const result = await authService.refresh(readRefreshToken(req), { req });
  tokenService.setRefreshCookie(res, result.refresh.token, result.refresh.expiresAt);
  return ok(res, {
    message: 'Session refreshed',
    data: { user: result.user, accessToken: result.accessToken, refreshToken: result.refresh.token },
  });
});

const logout = catchAsync(async (req, res) => {
  await authService.logout(readRefreshToken(req), { req });
  tokenService.clearRefreshCookie(res);
  return ok(res, { message: 'Signed out successfully' });
});

const me = catchAsync(async (req, res) =>
  ok(res, { message: 'Session loaded', data: await authService.getSession(req.user._id) }));

const changePassword = catchAsync(async (req, res) => {
  await authService.changePassword(req.user._id, req.body, { req });
  tokenService.clearRefreshCookie(res);
  return ok(res, { message: 'Password changed. Please sign in again.' });
});

const forgotPassword = catchAsync(async (req, res) => {
  const result = await authService.requestPasswordReset(req.body.email, { req });
  return ok(res, {
    message: 'If that account exists, a password reset link has been issued.',
    data: env.isProd ? null : { resetUrl: result.resetUrl || null, token: result.devToken || null },
  });
});

const resetPassword = catchAsync(async (req, res) => {
  await authService.resetPassword(req.body, { req });
  return ok(res, { message: 'Password reset successfully. You can now sign in.' });
});

const revokeAllSessions = catchAsync(async (req, res) => {
  await tokenService.revokeAllForUser(req.user._id, 'user revoked all sessions');
  tokenService.clearRefreshCookie(res);
  return ok(res, { message: 'All sessions revoked' });
});

module.exports = { login, refresh, logout, me, changePassword, forgotPassword, resetPassword, revokeAllSessions };
