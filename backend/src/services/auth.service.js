const User = require('../models/User');
const Role = require('../models/Role');
const ApiError = require('../utils/ApiError');
const env = require('../config/env');
const logger = require('../config/logger');
const tokenService = require('./token.service');
const auditService = require('./audit.service');
const settingsService = require('./settings.service');
const { randomToken, hashToken } = require('../utils/identifiers');

const PROFILE_POPULATE = [
  { path: 'role', select: 'key name level permissions' },
  { path: 'department', select: 'code name' },
  { path: 'faculty', select: 'code name' },
  { path: 'program', select: 'code name level' },
];

const loadProfile = (userId) => User.findById(userId).populate(PROFILE_POPULATE);

/** Public shape of the signed-in user, including the effective permission set. */
function toSession(user) {
  const json = user.toJSON();
  const role = user.role && typeof user.role === 'object' ? user.role : null;
  return {
    ...json,
    role: role ? { id: String(role._id || role.id), key: role.key, name: role.name, level: role.level } : json.role,
    permissions: role?.permissions || [],
  };
}

async function login({ identifier, password }, context = {}) {
  const query = identifier.includes('@')
    ? { email: identifier.toLowerCase().trim() }
    : { $or: [{ registrationNumber: identifier.toUpperCase().trim() }, { employeeId: identifier.toUpperCase().trim() }] };

  const user = await User.findOne(query).select('+password +failedLoginAttempts +lockedUntil');

  // Uniform failure message: never reveal whether the account exists.
  const invalid = ApiError.unauthorized('Invalid credentials');

  if (!user) {
    await auditService.record({
      ...context, action: 'login_failed', status: 'failure',
      entityType: 'User', description: `Unknown identifier: ${identifier}`,
    });
    throw invalid;
  }

  if (user.isLocked) {
    const minutes = Math.ceil((user.lockedUntil - Date.now()) / 60000);
    throw ApiError.forbidden(`Account temporarily locked. Try again in ${minutes} minute(s).`);
  }

  const matches = await user.comparePassword(password);
  if (!matches) {
    const settings = await settingsService.getSettings();
    const maxAttempts = settings.security?.maxFailedLogins || env.security.maxFailedLogins;
    user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
    if (user.failedLoginAttempts >= maxAttempts) {
      user.lockedUntil = new Date(Date.now() + env.security.lockMinutes * 60_000);
      user.failedLoginAttempts = 0;
    }
    await user.save({ validateBeforeSave: false });
    await auditService.record({
      ...context, actor: user, action: 'login_failed', status: 'failure',
      entityType: 'User', entityId: user._id, description: 'Incorrect password',
    });
    throw invalid;
  }

  if (user.status === 'suspended') throw ApiError.forbidden('Your account is suspended. Contact the library.');
  if (!['active', 'graduated'].includes(user.status)) {
    throw ApiError.forbidden(`Your account is ${user.status.replace('_', ' ')}.`);
  }

  const role = await Role.findById(user.role);
  if (!role || !role.isActive) throw ApiError.forbidden('Your role is not active. Contact an administrator.');

  user.failedLoginAttempts = 0;
  user.lockedUntil = null;
  user.lastLoginAt = new Date();
  user.lastLoginIp = context.req?.clientIp || '';
  await user.save({ validateBeforeSave: false });

  const profile = await loadProfile(user._id);
  const accessToken = tokenService.signAccessToken({ _id: user._id, roleKey: role.key, passwordChangedAt: user.passwordChangedAt });
  const refresh = await tokenService.issueRefreshToken(user, {
    ip: context.req?.clientIp,
    userAgent: context.req?.get?.('user-agent'),
  });

  await auditService.record({
    ...context, actor: { ...profile.toObject(), roleKey: role.key },
    action: 'login', entityType: 'User', entityId: user._id, description: 'Successful sign-in',
  });

  return { user: toSession(profile), accessToken, refresh };
}

async function refresh(refreshToken, context = {}) {
  const found = await tokenService.findActiveRefreshToken(refreshToken);
  if (!found) throw ApiError.unauthorized('Session expired. Please sign in again.');
  if (found.reused) {
    await tokenService.revokeAllForUser(found.doc.user, 'refresh token reuse detected');
    throw ApiError.unauthorized('Session revoked. Please sign in again.');
  }

  const user = await loadProfile(found.doc.user);
  if (!user || user.isDeleted) throw ApiError.unauthorized('Account no longer exists');
  if (user.status === 'suspended') throw ApiError.forbidden('Your account is suspended');

  const role = user.role;
  const rotated = await tokenService.rotateRefreshToken(refreshToken, user, {
    ip: context.req?.clientIp,
    userAgent: context.req?.get?.('user-agent'),
  });
  const accessToken = tokenService.signAccessToken({ _id: user._id, roleKey: role?.key, passwordChangedAt: user.passwordChangedAt });

  return { user: toSession(user), accessToken, refresh: rotated };
}

async function logout(refreshToken, context = {}) {
  await tokenService.revokeRefreshToken(refreshToken, 'logout');
  await auditService.record({ ...context, action: 'logout', entityType: 'User', entityId: context.req?.user?._id });
}

async function changePassword(userId, { currentPassword, newPassword }, context = {}) {
  const user = await User.findById(userId).select('+password');
  if (!user) throw ApiError.notFound('User not found');

  if (!(await user.comparePassword(currentPassword))) {
    throw ApiError.badRequest('Current password is incorrect');
  }
  if (await user.comparePassword(newPassword)) {
    throw ApiError.badRequest('New password must differ from the current password');
  }

  user.password = newPassword;
  user.mustChangePassword = false;
  await user.save();

  // Every existing session becomes invalid once the password changes.
  await tokenService.revokeAllForUser(user._id, 'password changed');
  await auditService.record({
    ...context, actor: user, action: 'password_changed', entityType: 'User', entityId: user._id,
  });
  return true;
}

/**
 * Always resolves, whether or not the address is registered, because the
 * response must not let a caller enumerate accounts. The token is returned to the
 * caller only outside production, where no mail transport is wired up.
 */
async function requestPasswordReset(email, context = {}) {
  const user = await User.findOne({ email: email.toLowerCase().trim() });
  if (!user) return { delivered: false };

  const token = randomToken(32);
  user.passwordResetTokenHash = hashToken(token);
  user.passwordResetExpiresAt = new Date(Date.now() + env.security.passwordResetMinutes * 60_000);
  await user.save({ validateBeforeSave: false });

  const resetUrl = `${env.frontendUrl}/reset-password?token=${token}&email=${encodeURIComponent(user.email)}`;
  logger.info(`Password reset requested for ${user.email}. Reset link: ${resetUrl}`);

  await auditService.record({
    ...context, actor: user, action: 'password_reset', entityType: 'User', entityId: user._id,
    description: 'Password reset requested',
  });

  return { delivered: true, devToken: env.isProd ? undefined : token, resetUrl: env.isProd ? undefined : resetUrl };
}

async function resetPassword({ token, email, newPassword }, context = {}) {
  const user = await User.findOne({
    email: email.toLowerCase().trim(),
    passwordResetTokenHash: hashToken(token),
    passwordResetExpiresAt: { $gt: new Date() },
  }).select('+password +passwordResetTokenHash +passwordResetExpiresAt');

  if (!user) throw ApiError.badRequest('Password reset link is invalid or has expired');

  user.password = newPassword;
  user.passwordResetTokenHash = null;
  user.passwordResetExpiresAt = null;
  user.mustChangePassword = false;
  if (user.status === 'inactive') user.status = 'active';
  await user.save();

  await tokenService.revokeAllForUser(user._id, 'password reset');
  await auditService.record({
    ...context, actor: user, action: 'password_reset', entityType: 'User', entityId: user._id,
    description: 'Password reset completed',
  });
  return true;
}

async function getSession(userId) {
  const user = await loadProfile(userId);
  if (!user) throw ApiError.notFound('User not found');
  return toSession(user);
}

module.exports = {
  login, refresh, logout, changePassword, requestPasswordReset, resetPassword,
  getSession, toSession, loadProfile, PROFILE_POPULATE,
};
