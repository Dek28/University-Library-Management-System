const mongoose = require('mongoose');
const { toJSONPlugin } = require('./plugins/common');
const { CLEARANCE_STATUS } = require('../constants/enums');

const { Schema } = mongoose;

/**
 * Library clearance for a graduating member. The obligation snapshot is stored
 * on the record so a printed certificate always reflects what was true at the
 * moment of approval, even if the account changes later.
 */
const clearanceSchema = new Schema(
  {
    clearanceCode: { type: String, required: true, unique: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    status: { type: String, enum: CLEARANCE_STATUS, default: 'pending', index: true },

    requestedAt: { type: Date, default: Date.now },
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },

    checkedAt: { type: Date, default: null },
    obligations: {
      activeLoans: { type: Number, default: 0 },
      overdueLoans: { type: Number, default: 0 },
      lostItems: { type: Number, default: 0 },
      damagedItems: { type: Number, default: 0 },
      outstandingFineTotal: { type: Number, default: 0 },
      outstandingFineCount: { type: Number, default: 0 },
    },
    blockingReasons: [{ type: String, trim: true }],

    verifiedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    verifiedAt: { type: Date, default: null },

    isOverride: { type: Boolean, default: false },
    overrideReason: { type: String, trim: true, default: '' },
    overrideBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    overrideAt: { type: Date, default: null },

    certificateNumber: { type: String, default: null },
    comments: { type: String, trim: true, default: '' },
  },
  { timestamps: true },
);

clearanceSchema.plugin(toJSONPlugin);
clearanceSchema.index({ user: 1, status: 1 });
clearanceSchema.index({ createdAt: -1 });
// One open clearance case per member at a time.
clearanceSchema.index(
  { user: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ['pending', 'blocked'] } }, name: 'one_open_clearance_per_user' },
);

module.exports = mongoose.model('Clearance', clearanceSchema);
