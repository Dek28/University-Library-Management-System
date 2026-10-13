const mongoose = require('mongoose');
const { toJSONPlugin } = require('./plugins/common');
const { LOAN_STATUS, COPY_CONDITION } = require('../constants/enums');

const { Schema } = mongoose;

/**
 * A circulation transaction. Loans are never hard deleted, because they are
 * the historical record backing fines, clearance and reporting.
 */
const loanSchema = new Schema(
  {
    transactionId: { type: String, required: true, unique: true },

    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    resource: { type: Schema.Types.ObjectId, ref: 'Resource', required: true, index: true },
    copy: { type: Schema.Types.ObjectId, ref: 'ResourceCopy', required: true, index: true },

    borrowDate: { type: Date, required: true, default: Date.now },
    dueDate: { type: Date, required: true, index: true },
    returnDate: { type: Date, default: null },

    status: { type: String, enum: LOAN_STATUS, default: 'active', index: true },

    issuedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    returnedTo: { type: Schema.Types.ObjectId, ref: 'User', default: null },

    renewalCount: { type: Number, default: 0, min: 0 },
    maxRenewals: { type: Number, default: 1, min: 0 },

    conditionOnIssue: { type: String, enum: COPY_CONDITION, default: 'good' },
    conditionOnReturn: { type: String, enum: COPY_CONDITION, default: null },

    daysOverdue: { type: Number, default: 0, min: 0 },
    fineAmount: { type: Number, default: 0, min: 0 },
    fines: [{ type: Schema.Types.ObjectId, ref: 'Fine' }],

    notes: { type: String, trim: true, default: '' },
    returnNotes: { type: String, trim: true, default: '' },
  },
  { timestamps: true },
);

loanSchema.plugin(toJSONPlugin);

loanSchema.index({ user: 1, status: 1 });
loanSchema.index({ status: 1, dueDate: 1 });
loanSchema.index({ borrowDate: -1 });
// At most one open loan per physical copy.
loanSchema.index(
  { copy: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ['active', 'overdue'] } }, name: 'one_open_loan_per_copy' },
);

loanSchema.virtual('isOpen').get(function isOpen() {
  return this.status === 'active' || this.status === 'overdue';
});

module.exports = mongoose.model('Loan', loanSchema);
