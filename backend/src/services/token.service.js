const jwt = require('jsonwebtoken');
const ms = require('../utils/duration');
const env = require('../config/env');
const RefreshToken = require('../models/RefreshToken');
const ApiError = require('../utils/ApiError');
const { randomToken, hashToken } = require('../utils/identifiers');

/**
 * Signs a short-lived access token.
 *
 * `pwd` carries the exact millisecond stamp of the account's current password
 * so a token minted before a password change is rejected, even if both
 * happened inside the same second.
 */
const signAccessToken = (user) =>
  jwt.sign(
    {
      sub: String(user._id),
      role: user.roleKey || undefined,
      pwd: user.passwordChangedAt ? new Date(user.passwordChangedAt).getTime() : 0,
      type: 'access',
    },
    env.jwt.accessSecret,
    { expiresIn: env.jwt.accessExpiresIn },
  );

/**
 * Refresh tokens are opaque random strings, not JWTs: they are only meaningful
 * against the stored hash, so revocation is immediate and total.
 */
async function issueRefreshToken(user, { ip, userAgent } = {}) {
  const token = randomToken(48);
  const expiresAt = new Date(Date.now() + ms(env.jwt.refreshExpiresIn));
  await RefreshToken.create({
    user: user._id,
    tokenHash: hashToken(token),
    expiresAt,
    ipAddress: ip || '',
    userAgent: userAgent || '',
  });
  return { token, expiresAt };
}

async function findActiveRefreshToken(token) {
  if (!token) return null;
  const doc = await RefreshToken.findOne({ tokenHash: hashToken(token) }).select('+tokenHash');
  if (!doc) return null;
  if (doc.revokedAt) return { doc, reused: true };
  if (doc.expiresAt <= new Date()) return null;
  return { doc, reused: false };
}

/**
 * Rotates a refresh token. Presenting an already-revoked token is treated as
 * theft and revokes every session for that account.
 */
async function rotateRefreshToken(oldToken, user, context = {}) {
  const found = await findActiveRefreshToken(oldToken);
  if (!found) throw ApiError.unauthorized('Invalid or expired session');

  if (found.reused) {
    await revokeAllForUser(found.doc.user, 'refresh token reuse detected');
    throw ApiError.unauthorized('Session revoked. Please sign in again.');
  }

  const next = await issueRefreshToken(user, context);
  found.doc.revokedAt = new Date();
  found.doc.revokedReason = 'rotated';
  found.doc.replacedBy = hashToken(next.token);
  await found.doc.save();
  return next;
}

async function revokeRefreshToken(token, reason = 'logout') {
  if (!token) return;
  await RefreshToken.updateOne(
    { tokenHash: hashToken(token), revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: reason } },
  );
}

const revokeAllForUser = (userId, reason = 'revoked') =>
  RefreshToken.updateMany({ user: userId, revokedAt: null }, { $set: { revokedAt: new Date(), revokedReason: reason } });

function verifyAccessToken(token) {
  try {
    return jwt.verify(token, env.jwt.accessSecret);
  } catch (err) {
    throw err.name === 'TokenExpiredError'
      ? ApiError.unauthorized('Access token expired')
      : ApiError.unauthorized('Invalid access token');
  }
}

/** Sets the refresh token as an HTTP-only cookie. */
function setRefreshCookie(res, token, expiresAt) {
  res.cookie(env.jwt.refreshCookieName, token, {
    httpOnly: true,
    secure: env.security.cookieSecure,
    sameSite: env.security.cookieSameSite,
    expires: expiresAt,
    path: '/',
  });
}

const clearRefreshCookie = (res) =>
  res.clearCookie(env.jwt.refreshCookieName, {
    httpOnly: true,
    secure: env.security.cookieSecure,
    sameSite: env.security.cookieSameSite,
    path: '/',
  });

module.exports = {
  signAccessToken, issueRefreshToken, rotateRefreshToken, revokeRefreshToken,
  revokeAllForUser, verifyAccessToken, findActiveRefreshToken,
  setRefreshCookie, clearRefreshCookie,
};
