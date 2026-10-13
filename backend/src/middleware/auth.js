const User = require('../models/User');
const Role = require('../models/Role');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const tokenService = require('../services/token.service');

/**
 * Roles change rarely but are read on every request, so they are cached
 * in-process. `invalidateRoleCache` is called by the role controller on write.
 */
const roleCache = new Map();
const ROLE_TTL_MS = 60_000;

async function loadRole(roleId) {
  const key = String(roleId);
  const cached = roleCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.role;

  const role = await Role.findById(roleId).lean();
  if (role) roleCache.set(key, { role, expiresAt: Date.now() + ROLE_TTL_MS });
  return role;
}

const invalidateRoleCache = () => roleCache.clear();

function extractToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return null;
}

/** Verifies the access token and attaches `req.user` with resolved permissions. */
const authenticate = catchAsync(async (req, res, next) => {
  const token = extractToken(req);
  if (!token) throw ApiError.unauthorized('Authentication required');

  const payload = tokenService.verifyAccessToken(token);
  if (payload.type !== 'access') throw ApiError.unauthorized('Invalid token type');

  const user = await User.findById(payload.sub);
  if (!user || user.isDeleted) throw ApiError.unauthorized('Account no longer exists');

  // A password change invalidates every previously issued access token.
  if (user.isTokenStale(payload.pwd)) {
    throw ApiError.unauthorized('Password was changed. Please sign in again.');
  }

  if (user.status === 'suspended') throw ApiError.forbidden('Your account is suspended');
  if (!['active', 'graduated'].includes(user.status)) {
    throw ApiError.forbidden(`Your account is ${user.status.replace('_', ' ')}`);
  }

  const role = await loadRole(user.role);
  if (!role || !role.isActive) throw ApiError.forbidden('Your role is not active');

  req.user = user;
  req.user.roleKey = role.key;
  req.role = role;
  req.permissions = new Set(role.permissions || []);
  return next();
});

/** Attaches `req.user` when a valid token is present, but never rejects. */
const optionalAuth = catchAsync(async (req, res, next) => {
  if (!extractToken(req)) return next();
  try {
    return await authenticate(req, res, next);
  } catch (err) {
    return next();
  }
});

const has = (req, permission) => req.permissions?.has(permission);

/** Requires every listed permission. */
const requirePermission = (...permissions) => (req, res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  const missing = permissions.filter((p) => !has(req, p));
  if (missing.length) {
    return next(ApiError.forbidden(`Missing permission: ${missing.join(', ')}`));
  }
  return next();
};

/** Requires at least one of the listed permissions. */
const requireAnyPermission = (...permissions) => (req, res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  if (!permissions.some((p) => has(req, p))) {
    return next(ApiError.forbidden(`Requires one of: ${permissions.join(', ')}`));
  }
  return next();
};

const requireRole = (...roleKeys) => (req, res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  if (!roleKeys.includes(req.user.roleKey)) return next(ApiError.forbidden());
  return next();
};

/**
 * Allows the request when the caller owns the targeted record, or holds the
 * elevated permission. `paramName` names the route/query param holding a user id.
 */
const requireSelfOrPermission = (permission, paramName = 'userId') => (req, res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  const target = req.params[paramName] || req.query[paramName] || req.body[paramName];
  if (target && String(target) === String(req.user._id)) return next();
  if (has(req, permission)) return next();
  return next(ApiError.forbidden());
};

module.exports = {
  authenticate, optionalAuth, requirePermission, requireAnyPermission,
  requireRole, requireSelfOrPermission, invalidateRoleCache, loadRole, has,
};
