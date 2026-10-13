const mongoose = require('mongoose');
const { toJSONPlugin } = require('./plugins/common');

const { Schema } = mongoose;

/**
 * Server-side record of an issued refresh token. Only the SHA-256 hash is
 * stored, so a database leak cannot be replayed against the API. Rotation
 * marks the previous document `replacedBy`, which makes token reuse
 * detectable and revocable.
 */
const refreshTokenSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true, select: false },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    revokedReason: { type: String, default: '' },
    replacedBy: { type: String, default: null },
    ipAddress: { type: String, default: '' },
    userAgent: { type: String, default: '' },
  },
  { timestamps: true },
);

refreshTokenSchema.plugin(toJSONPlugin);
refreshTokenSchema.index({ user: 1, revokedAt: 1 });
// Let MongoDB reap expired sessions on its own.
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('RefreshToken', refreshTokenSchema);
