const mongoose = require('mongoose');
const { toJSONPlugin } = require('./plugins/common');
const { FINE_TYPES, FINE_STATUS } = require('../constants/enums');

const { Schema } = mongoose;

const fineSchema = new Schema(
  {
    fineCode: { type: String, required: true, unique: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    loan: { type: Schema.Types.ObjectId, ref: 'Loan', default: null, index: true },
    resource: { type: Schema.Types.ObjectId, ref: 'Resource', default: null },
    copy: { type: Schema.Types.ObjectId, ref: 'ResourceCopy', default: null },

    fineType: { type: String, enum: FINE_TYPES, required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    amountPaid: { type: Number, default: 0, min: 0 },
    amountWaived: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: 'USD' },

    status: { type: String, enum: FINE_STATUS, default: 'outstanding', index: true },

    reason: { type: String, trim: true, default: '' },
    daysOverdue: { type: Number, default: 0, min: 0 },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    settledAt: { type: Date, default: null },
    waivedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    waiveReason: { type: String, trim: true, default: '' },
    notes: { type: String, trim: true, default: '' },
  },
  { timestamps: true },
);

fineSchema.plugin(toJSONPlugin);
fineSchema.index({ user: 1, status: 1 });
fineSchema.index({ createdAt: -1 });

/** Amount still owed after payments and waivers. Never negative. */
fineSchema.virtual('balance').get(function balance() {
  return Math.max(0, Number((this.amount - this.amountPaid - this.amountWaived).toFixed(2)));
});

/** Recomputes `status` from the money already applied to this fine. */
fineSchema.methods.recalculateStatus = function recalculateStatus() {
  if (this.status === 'cancelled') return this.status;
  const settled = Number((this.amountPaid + this.amountWaived).toFixed(2));
  if (settled >= this.amount) {
    this.status = this.amountWaived > 0 && this.amountPaid === 0 ? 'waived' : 'paid';
    this.settledAt = this.settledAt || new Date();
  } else if (settled > 0) {
    this.status = 'partially_paid';
    this.settledAt = null;
  } else {
    this.status = 'outstanding';
    this.settledAt = null;
  }
  return this.status;
};

fineSchema.pre('validate', function guardBalances(next) {
  if (this.amountPaid + this.amountWaived > this.amount + 0.001) {
    return next(new Error('Payments and waivers cannot exceed the fine amount'));
  }
  return next();
});

module.exports = mongoose.model('Fine', fineSchema);
