const rateLimit = require('express-rate-limit');
const xss = require('xss');
const env = require('../config/env');

/**
 * Credentials are compared and hashed exactly as typed. Filtering them would
 * silently change what a person's password is.
 */
const VERBATIM_FIELDS = new Set([
  'password', 'currentPassword', 'newPassword', 'confirmPassword', 'defaultPassword', 'token', 'refreshToken',
]);

/** Recursively strips HTML/script payloads out of string values. */
function sanitiseValue(value, key) {
  if (VERBATIM_FIELDS.has(key)) return value;
  if (typeof value === 'string') return xss(value, { whiteList: {}, stripIgnoreTag: true, stripIgnoreTagBody: ['script'] });
  if (Array.isArray(value)) return value.map((item) => sanitiseValue(item, key));
  if (value && typeof value === 'object' && value.constructor === Object) {
    return Object.entries(value).reduce((acc, [k, v]) => { acc[k] = sanitiseValue(v, k); return acc; }, {});
  }
  return value;
}

/**
 * XSS hardening for request bodies. Query/params are left alone because they
 * are already schema-validated and rewriting them breaks Express getters.
 */
const xssClean = (req, res, next) => {
  if (req.body && typeof req.body === 'object') req.body = sanitiseValue(req.body);
  next();
};

/**
 * Records the caller IP once for audit logging. `req.ip` honours the
 * `trust proxy` setting, so a forwarding header is believed only when a
 * trusted proxy is configured to set it.
 */
const captureClientIp = (req, res, next) => {
  req.clientIp = req.ip || '';
  next();
};

/**
 * Counters are kept in this process's memory. Behind several instances each one
 * counts separately, so the effective ceiling is the limit times the instance
 * count; a shared store (for example Redis) is needed to make it exact.
 */
const makeLimiter = (max, windowMs, message, { skip, ...options } = {}) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => (env.isTest && !env.security.enforceRateLimitsInTest) || (skip ? skip(req) : false),
    message: { success: false, message, errors: [] },
    ...options,
  });

const apiLimiter = makeLimiter(
  env.security.rateLimitMax,
  env.security.rateLimitWindowMs,
  'Too many requests. Please try again later.',
);

const authLimiter = makeLimiter(
  env.security.authRateLimitMax,
  env.security.rateLimitWindowMs,
  'Too many authentication attempts. Please try again later.',
);

// Only failed sign-ins count, so many students behind one campus address can
// still sign in while a guessing attack from that address is stopped.
const loginLimiter = makeLimiter(
  env.security.authRateLimitMax,
  env.security.rateLimitWindowMs,
  'Too many failed sign-in attempts. Please try again later.',
  { skipSuccessfulRequests: true },
);

// Refreshing is routine, so it gets more room than the password endpoints.
const refreshLimiter = makeLimiter(
  env.security.authRateLimitMax * 3,
  env.security.rateLimitWindowMs,
  'Too many session requests. Please try again later.',
);

const uploadLimiter = makeLimiter(60, 15 * 60 * 1000, 'Too many uploads. Please slow down.');

const EXPORT_FORMATS = new Set(['csv', 'pdf', 'xlsx']);
const isExportRequest = (req) => req.method === 'GET'
  && (EXPORT_FORMATS.has(req.query.format) || /^\/reports\/[^/]+/.test(req.path));

/** Report runs and CSV/PDF/Excel exports are the most expensive reads in the API. */
const exportLimiter = makeLimiter(
  30,
  15 * 60 * 1000,
  'Too many report or export requests. Please wait a few minutes.',
  { skip: (req) => !isExportRequest(req) },
);

module.exports = {
  xssClean, captureClientIp, apiLimiter, authLimiter, loginLimiter, refreshLimiter, uploadLimiter, exportLimiter,
};
