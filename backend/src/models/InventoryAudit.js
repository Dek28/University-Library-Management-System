const mongoose = require('mongoose');
const { toJSONPlugin } = require('./plugins/common');
const { INVENTORY_AUDIT_STATUS, COPY_CONDITION } = require('../constants/enums');

const { Schema } = mongoose;

/** One scanned copy inside a stock-verification exercise. */
const auditItemSchema = new Schema(
  {
    copy: { type: Schema.Types.ObjectId, ref: 'ResourceCopy', required: true },
    accessionNumber: { type: String, required: true },
    expectedStatus: { type: String, required: true },
    foundStatus: { type: String, enum: ['found', 'missing', 'damaged', 'misplaced'], required: true },
    condition: { type: String, enum: COPY_CONDITION, default: 'good' },
    remark: { type: String, trim: true, default: '' },
    verifiedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    verifiedAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const inventoryAuditSchema = new Schema(
  {
    auditCode: { type: String, required: true, unique: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },

    // Optional narrowing of the audit population.
    shelf: { type: Schema.Types.ObjectId, ref: 'Shelf', default: null },
    category: { type: Schema.Types.ObjectId, ref: 'Category', default: null },

    status: { type: String, enum: INVENTORY_AUDIT_STATUS, default: 'in_progress', index: true },

    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
    startedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    completedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },

    expectedCount: { type: Number, default: 0 },
    verifiedCount: { type: Number, default: 0 },
    missingCount: { type: Number, default: 0 },
    damagedCount: { type: Number, default: 0 },
    misplacedCount: { type: Number, default: 0 },

    items: [auditItemSchema],
    // Whether completing the audit pushed `missing`/`damaged` onto the copies.
    appliedAdjustments: { type: Boolean, default: false },
    notes: { type: String, trim: true, default: '' },
  },
  { timestamps: true },
);

inventoryAuditSchema.plugin(toJSONPlugin);
inventoryAuditSchema.index({ createdAt: -1 });

module.exports = mongoose.model('InventoryAudit', inventoryAuditSchema);
