const mongoose = require('mongoose');
const { toJSONPlugin, softDeletePlugin, authorshipPlugin } = require('./plugins/common');
const { COPY_STATUS, COPY_CONDITION } = require('../constants/enums');

const { Schema } = mongoose;

/** One physical, shelvable item belonging to a catalogue title. */
const copySchema = new Schema(
  {
    resource: { type: Schema.Types.ObjectId, ref: 'Resource', required: true, index: true },

    accessionNumber: { type: String, required: true, trim: true, uppercase: true },
    barcode: { type: String, required: true, trim: true },

    shelf: { type: Schema.Types.ObjectId, ref: 'Shelf', default: null, index: true },
    section: { type: String, trim: true, default: '' },
    rack: { type: String, trim: true, default: '' },

    status: { type: String, enum: COPY_STATUS, default: 'available', index: true },
    condition: { type: String, enum: COPY_CONDITION, default: 'good' },

    acquisitionDate: { type: Date, default: Date.now },
    acquisitionSource: { type: String, trim: true, default: 'purchase' },
    price: { type: Number, min: 0, default: 0 },
    replacementCost: { type: Number, min: 0, default: 0 },

    currentLoan: { type: Schema.Types.ObjectId, ref: 'Loan', default: null },
    lastBorrowedAt: { type: Date, default: null },
    borrowCount: { type: Number, default: 0, min: 0 },

    lastVerifiedAt: { type: Date, default: null },
    notes: { type: String, trim: true, default: '' },
  },
  { timestamps: true },
);

copySchema.plugin(toJSONPlugin);
copySchema.plugin(softDeletePlugin);
copySchema.plugin(authorshipPlugin);

copySchema.index({ accessionNumber: 1 }, { unique: true });
copySchema.index({ barcode: 1 }, { unique: true });
copySchema.index({ resource: 1, status: 1 });

copySchema.virtual('isAvailable').get(function isAvailable() {
  return this.status === 'available';
});

module.exports = mongoose.model('ResourceCopy', copySchema);
