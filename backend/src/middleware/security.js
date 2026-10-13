const rateLimit = require('express-rate-limit');
const xss = require('xss');
const env = require('../config/env');

/** Recursively strips HTML/script payloads out of string values. */
function sanitiseValue(value) {
  if (typeof value === 'string') return xss(value, { whiteList: {}, stripIgnoreTag: true, stripIgnoreTagBody: ['script'] });
  if (Array.isArray(value)) return value.map(sanitiseValue);
  if (value && typeof value === 'object' && value.constructor === Object) {
    return Object.entries(value).reduce((acc, [k, v]) => { acc[k] = sanitiseValue(v); return acc; }, {});
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

/** Records the caller IP once so audit logging is consistent behind proxies. */
const captureClientIp = (req, res, next) => {
  req.clientIp = (req.headers['x-forwarded-for']?.split(',')[0] || req.ip || '').trim();
  next();
};

const makeLimiter = (max, windowMs, message) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => env.isTest,
    message: { success: false, message, errors: [] },
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

const uploadLimiter = makeLimiter(60, 15 * 60 * 1000, 'Too many uploads. Please slow down.');

module.exports = { xssClean, captureClientIp, apiLimiter, authLimiter, uploadLimiter };
