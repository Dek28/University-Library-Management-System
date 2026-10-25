const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const int = (value, fallback) => {
  const n = Number.parseInt(value, 10);
  return Number.isNaN(n) ? fallback : n;
};

const bool = (value, fallback = false) => {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

const list = (value, fallback) =>
  (value ? String(value).split(',') : fallback).map((v) => v.trim()).filter(Boolean);

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test',
  port: int(process.env.PORT, 5000),
  apiPrefix: process.env.API_PREFIX || '/api/v1',

  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ulms',
  mongoUriTest: process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/ulms_test',

  jwt: {
    usingDefaultSecrets: !process.env.JWT_ACCESS_SECRET || !process.env.JWT_REFRESH_SECRET,
    accessSecret: process.env.JWT_ACCESS_SECRET || 'dev-access-secret-change-me',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-me',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    refreshCookieName: process.env.REFRESH_COOKIE_NAME || 'ulms_rt',
  },

  // Reset links, stack traces and other internals are exposed only when the
  // environment is explicitly development or test, so a deployment that forgets
  // to set NODE_ENV does not leak them.
  exposeDevSecrets: bool(process.env.EXPOSE_DEV_SECRETS, ['development', 'test'].includes(process.env.NODE_ENV)),

  // Number of reverse proxies in front of the API. Set it only when a proxy
  // you control sets X-Forwarded-For, otherwise clients could fake their IP.
  trustProxyHops: int(process.env.TRUST_PROXY, process.env.NODE_ENV === 'production' ? 1 : 0),

  // Interactive API documentation is off in production unless asked for.
  apiDocsEnabled: bool(process.env.ENABLE_API_DOCS, process.env.NODE_ENV !== 'production'),

  security: {
    bcryptRounds: int(process.env.BCRYPT_ROUNDS, process.env.NODE_ENV === 'test' ? 4 : 12),
    maxFailedLogins: int(process.env.MAX_FAILED_LOGINS, 5),
    lockMinutes: int(process.env.ACCOUNT_LOCK_MINUTES, 15),
    passwordResetMinutes: int(process.env.PASSWORD_RESET_MINUTES, 30),
    rateLimitWindowMs: int(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
    rateLimitMax: int(process.env.RATE_LIMIT_MAX, 600),
    authRateLimitMax: int(process.env.AUTH_RATE_LIMIT_MAX, 20),
    cookieSecure: bool(process.env.COOKIE_SECURE, process.env.NODE_ENV === 'production'),
    cookieSameSite: process.env.COOKIE_SAME_SITE || 'lax',
    // Tests switch this on to exercise the limiters, which are otherwise skipped.
    enforceRateLimitsInTest: false,
  },

  cors: {
    origins: list(process.env.CORS_ORIGINS, ['http://localhost:5173', 'http://127.0.0.1:5173']),
  },

  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',

  storage: {
    driver: process.env.STORAGE_DRIVER || 'local',
    localRoot: process.env.UPLOAD_DIR || path.resolve(__dirname, '../uploads'),
    publicBaseUrl: process.env.UPLOAD_PUBLIC_BASE_URL || '/uploads',
    maxFileSizeMb: int(process.env.MAX_FILE_SIZE_MB, 25),
    maxImageSizeMb: int(process.env.MAX_IMAGE_SIZE_MB, 5),
  },

  jobs: {
    enabled: bool(process.env.ENABLE_JOBS, true),
    overdueCron: process.env.CRON_OVERDUE || '0 1 * * *',
    reminderCron: process.env.CRON_REMINDERS || '30 1 * * *',
    reservationCron: process.env.CRON_RESERVATIONS || '0 2 * * *',
  },

  seed: {
    adminEmail: process.env.SEED_ADMIN_EMAIL || 'admin@example.edu',
    adminPassword: process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!',
  },

  logLevel: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'test' ? 'error' : 'info'),
};

if (env.isProd) {
  const weak = [
    ['JWT_ACCESS_SECRET', env.jwt.accessSecret],
    ['JWT_REFRESH_SECRET', env.jwt.refreshSecret],
  ].filter(([, v]) => !v || v.includes('change-me') || v.length < 32);
  if (weak.length) {
    throw new Error(
      `Refusing to start in production with insecure secrets: ${weak.map(([k]) => k).join(', ')}`,
    );
  }

  const problems = [];
  if (!process.env.CORS_ORIGINS) problems.push('CORS_ORIGINS must list the production frontend origin(s)');
  if (!process.env.FRONTEND_URL) problems.push('FRONTEND_URL must be set to the production frontend URL');
  if (env.cors.origins.includes('*')) problems.push('CORS_ORIGINS must not contain a wildcard');
  if (!env.security.cookieSecure) problems.push('COOKIE_SECURE must be true (the API must be served over HTTPS)');
  if (env.security.cookieSameSite.toLowerCase() === 'none' && !env.security.cookieSecure) {
    problems.push('COOKIE_SAME_SITE=none requires COOKIE_SECURE=true');
  }
  if (problems.length) throw new Error(`Refusing to start in production: ${problems.join('; ')}`);
}

module.exports = env;
