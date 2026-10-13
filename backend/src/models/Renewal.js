const mongoose = require('mongoose');
const { toJSONPlugin } = require('./plugins/common');

const { Schema } = mongoose;

/** Immutable audit trail of every loan extension. */
const renewalSchema = new Schema(
  {
    loan: { type: Schema.Types.ObjectId, ref: 'Loan', required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    previousDueDate: { type: Date, required: true },
    newDueDate: { type: Date, required: true },
    renewalNumber: { type: Number, required: true, min: 1 },
    renewedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    channel: { type: String, enum: ['desk', 'self_service'], default: 'desk' },
    notes: { type: String, trim: true, default: '' },
  },
  { timestamps: true },
);

renewalSchema.plugin(toJSONPlugin);
renewalSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Renewal', renewalSchema);
