const mongoose = require('mongoose');
const { toJSONPlugin } = require('./plugins/common');
const { ROLE_KEYS } = require('../constants/permissions');

const { Schema } = mongoose;

/** Borrowing entitlement for one borrower role. */
const borrowingRuleSchema = new Schema(
  {
    roleKey: { type: String, required: true },
    maxBooks: { type: Number, required: true, min: 0, default: 3 },
    loanPeriodDays: { type: Number, required: true, min: 1, default: 14 },
    maxRenewals: { type: Number, required: true, min: 0, default: 1 },
    renewalPeriodDays: { type: Number, min: 1, default: 14 },
    // Outstanding balance at or above which new loans are refused.
    blockingFineThreshold: { type: Number, min: 0, default: 0 },
    allowedResourceTypes: [{ type: String }],
  },
  { _id: false },
);

/** Fine policy, optionally scoped to a resource type. */
const finePolicySchema = new Schema(
  {
    resourceType: { type: String, default: 'default' },
    overdueRatePerDay: { type: Number, min: 0, default: 0.5 },
    gracePeriodDays: { type: Number, min: 0, default: 0 },
    maxFineAmount: { type: Number, min: 0, default: 50 },
    // Fallback used when a copy has no replacement cost of its own.
    lostItemBaseFine: { type: Number, min: 0, default: 25 },
    damagedItemFine: { type: Number, min: 0, default: 10 },
    severelyDamagedFine: { type: Number, min: 0, default: 20 },
    replacementMultiplier: { type: Number, min: 0, default: 1 },
  },
  { _id: false },
);

const systemSettingSchema = new Schema(
  {
    // Single-document collection; `key` keeps that explicit and enforceable.
    key: { type: String, default: 'global', unique: true, immutable: true },

    institution: {
      universityName: { type: String, default: 'University' },
      libraryName: { type: String, default: 'University Library' },
      logoUrl: { type: String, default: null },
      email: { type: String, default: '' },
      phone: { type: String, default: '' },
      address: { type: String, default: '' },
      website: { type: String, default: '' },
    },

    academic: {
      currentAcademicYear: { type: String, default: '' },
      currentSemester: { type: Number, min: 1, max: 3, default: 1 },
    },

    locale: {
      currency: { type: String, default: 'USD' },
      currencySymbol: { type: String, default: '$' },
      timezone: { type: String, default: 'UTC' },
      dateFormat: { type: String, default: 'YYYY-MM-DD' },
    },

    borrowingRules: { type: [borrowingRuleSchema], default: undefined },
    finePolicies: { type: [finePolicySchema], default: undefined },

    circulation: {
      // Off: no fines are raised, and existing ones no longer block borrowing,
      // renewal or clearance. Existing fine records are kept either way.
      finesEnabled: { type: Boolean, default: true },
      reservationExpiryDays: { type: Number, min: 1, default: 3 },
      dueSoonReminderDays: { type: Number, min: 1, default: 3 },
      blockBorrowingWhenOverdue: { type: Boolean, default: true },
      blockRenewalWhenReserved: { type: Boolean, default: true },
      allowSelfRenewal: { type: Boolean, default: true },
    },

    operatingHours: [{
      day: { type: String, enum: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] },
      opensAt: { type: String, default: '08:00' },
      closesAt: { type: String, default: '20:00' },
      isClosed: { type: Boolean, default: false },
    }],

    uploads: {
      maxFileSizeMb: { type: Number, min: 1, default: 25 },
      allowedDocumentTypes: {
        type: [String],
        default: ['application/pdf', 'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.ms-powerpoint',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          'application/epub+zip'],
      },
      allowedImageTypes: { type: [String], default: ['image/jpeg', 'image/png', 'image/webp'] },
    },

    security: {
      passwordMinLength: { type: Number, min: 8, default: 8 },
      passwordExpiryDays: { type: Number, min: 0, default: 0 },
      maxFailedLogins: { type: Number, min: 1, default: 5 },
    },

    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

systemSettingSchema.plugin(toJSONPlugin);

const DEFAULT_BORROWING_RULES = [
  { roleKey: ROLE_KEYS.STUDENT, maxBooks: 3, loanPeriodDays: 14, maxRenewals: 1, renewalPeriodDays: 14, blockingFineThreshold: 10 },
  { roleKey: ROLE_KEYS.LECTURER, maxBooks: 5, loanPeriodDays: 30, maxRenewals: 2, renewalPeriodDays: 30, blockingFineThreshold: 20 },
  { roleKey: ROLE_KEYS.LIBRARIAN, maxBooks: 5, loanPeriodDays: 30, maxRenewals: 2, renewalPeriodDays: 30, blockingFineThreshold: 20 },
  { roleKey: ROLE_KEYS.ADMIN, maxBooks: 5, loanPeriodDays: 30, maxRenewals: 2, renewalPeriodDays: 30, blockingFineThreshold: 20 },
  { roleKey: ROLE_KEYS.SUPER_ADMIN, maxBooks: 10, loanPeriodDays: 30, maxRenewals: 3, renewalPeriodDays: 30, blockingFineThreshold: 0 },
];

const DEFAULT_FINE_POLICIES = [
  { resourceType: 'default', overdueRatePerDay: 0.5, gracePeriodDays: 0, maxFineAmount: 50, lostItemBaseFine: 25, damagedItemFine: 10, severelyDamagedFine: 20, replacementMultiplier: 1 },
  { resourceType: 'reference', overdueRatePerDay: 2, gracePeriodDays: 0, maxFineAmount: 100, lostItemBaseFine: 50, damagedItemFine: 20, severelyDamagedFine: 40, replacementMultiplier: 1.2 },
];

const DEFAULT_OPERATING_HOURS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((day) => ({
  day,
  opensAt: day === 'sun' ? '00:00' : '08:00',
  closesAt: day === 'sun' ? '00:00' : (day === 'sat' ? '14:00' : '20:00'),
  isClosed: day === 'sun',
}));

systemSettingSchema.statics.defaults = () => ({
  key: 'global',
  borrowingRules: DEFAULT_BORROWING_RULES,
  finePolicies: DEFAULT_FINE_POLICIES,
  operatingHours: DEFAULT_OPERATING_HOURS,
});

module.exports = mongoose.model('SystemSetting', systemSettingSchema);
module.exports.DEFAULT_BORROWING_RULES = DEFAULT_BORROWING_RULES;
module.exports.DEFAULT_FINE_POLICIES = DEFAULT_FINE_POLICIES;
module.exports.DEFAULT_OPERATING_HOURS = DEFAULT_OPERATING_HOURS;
