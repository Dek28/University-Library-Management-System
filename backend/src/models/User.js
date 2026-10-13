const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const env = require('../config/env');
const { toJSONPlugin, softDeletePlugin } = require('./plugins/common');
const { USER_STATUS, GENDERS } = require('../constants/enums');

const { Schema } = mongoose;

const userSchema = new Schema(
  {
    registrationNumber: { type: String, trim: true, uppercase: true, sparse: true, unique: true },
    employeeId: { type: String, trim: true, uppercase: true, sparse: true, unique: true },
    barcode: { type: String, trim: true, sparse: true, unique: true },

    firstName: { type: String, required: true, trim: true },
    middleName: { type: String, trim: true, default: '' },
    lastName: { type: String, required: true, trim: true },
    gender: { type: String, enum: GENDERS, default: 'undisclosed' },
    dateOfBirth: { type: Date, default: null },

    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, trim: true, default: '' },
    address: { type: String, trim: true, default: '' },

    password: { type: String, required: true, select: false, minlength: 8 },
    passwordChangedAt: { type: Date, default: null },
    passwordResetTokenHash: { type: String, select: false, default: null },
    passwordResetExpiresAt: { type: Date, select: false, default: null },
    mustChangePassword: { type: Boolean, default: false },

    role: { type: Schema.Types.ObjectId, ref: 'Role', required: true, index: true },

    faculty: { type: Schema.Types.ObjectId, ref: 'Faculty', default: null, index: true },
    department: { type: Schema.Types.ObjectId, ref: 'Department', default: null, index: true },
    program: { type: Schema.Types.ObjectId, ref: 'Program', default: null },
    academicYear: { type: String, trim: true, default: '' },
    yearOfStudy: { type: Number, min: 1, max: 10, default: null },
    semester: { type: Number, min: 1, max: 3, default: null },
    graduationYear: { type: Number, default: null },

    profilePhoto: { type: String, default: null },

    status: { type: String, enum: USER_STATUS, default: 'active', index: true },
    statusReason: { type: String, trim: true, default: '' },

    // Denormalised counters kept in step by the circulation services; they are
    // conveniences for listings, never the source of truth for eligibility.
    activeLoanCount: { type: Number, default: 0, min: 0 },
    outstandingFineTotal: { type: Number, default: 0, min: 0 },

    borrowingSuspendedUntil: { type: Date, default: null },
    clearanceStatus: { type: String, default: 'not_requested' },

    lastLoginAt: { type: Date, default: null },
    lastLoginIp: { type: String, default: null },
    failedLoginAttempts: { type: Number, default: 0, select: false },
    lockedUntil: { type: Date, default: null, select: false },

    notes: { type: String, trim: true, default: '' },
  },
  { timestamps: true },
);

userSchema.plugin(toJSONPlugin);
userSchema.plugin(softDeletePlugin);

userSchema.index({ firstName: 'text', lastName: 'text', email: 'text', registrationNumber: 'text' },
  { name: 'user_text_search' });
userSchema.index({ status: 1, role: 1 });
userSchema.index({ department: 1, status: 1 });

userSchema.virtual('fullName').get(function fullName() {
  return [this.firstName, this.middleName, this.lastName].filter(Boolean).join(' ');
});

userSchema.virtual('identifier').get(function identifier() {
  return this.registrationNumber || this.employeeId || this.email;
});

userSchema.virtual('isLocked').get(function isLocked() {
  return Boolean(this.lockedUntil && this.lockedUntil > new Date());
});

userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, env.security.bcryptRounds);
  // Recorded only for an actual change, not at creation.
  if (!this.isNew) this.passwordChangedAt = new Date();
  return next();
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

/** Millisecond stamp of the last password change; 0 when never changed. */
userSchema.methods.passwordStamp = function passwordStamp() {
  return this.passwordChangedAt ? this.passwordChangedAt.getTime() : 0;
};

/**
 * True when an access token was issued before the current password.
 *
 * The check compares an exact millisecond stamp carried in the token rather
 * than the JWT `iat` claim, whose one-second granularity would let a token
 * minted in the same second as the change survive it.
 */
userSchema.methods.isTokenStale = function isTokenStale(tokenPasswordStamp) {
  return this.passwordStamp() !== (tokenPasswordStamp || 0);
};

module.exports = mongoose.model('User', userSchema);
