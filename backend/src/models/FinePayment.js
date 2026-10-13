const mongoose = require('mongoose');
const { toJSONPlugin } = require('./plugins/common');

const { Schema } = mongoose;

/** Ledger entry for money (or a waiver) applied against a fine. */
const paymentSchema = new Schema(
  {
    receiptNumber: { type: String, required: true, unique: true },
    fine: { type: Schema.Types.ObjectId, ref: 'Fine', required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    kind: { type: String, enum: ['payment', 'waiver', 'adjustment'], default: 'payment', index: true },
    method: { type: String, enum: ['cash', 'bank', 'mobile_money', 'card', 'internal'], default: 'cash' },
    reference: { type: String, trim: true, default: '' },
    notes: { type: String, trim: true, default: '' },
    processedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    paidAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true },
);

paymentSchema.plugin(toJSONPlugin);
paymentSchema.index({ paidAt: -1 });

module.exports = mongoose.model('FinePayment', paymentSchema);
