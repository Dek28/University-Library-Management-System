const mongoose = require('mongoose');
const { toJSONPlugin } = require('./plugins/common');

const { Schema } = mongoose;

/**
 * Append-only activity trail. Nothing in the application updates or deletes
 * these documents; the pre-hooks below make that a hard guarantee rather than
 * a convention.
 */
const auditLogSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    actorName: { type: String, default: '' },
    actorRole: { type: String, default: '' },

    action: { type: String, required: true, index: true },
    entityType: { type: String, default: null, index: true },
    entityId: { type: Schema.Types.ObjectId, default: null, index: true },
    entityLabel: { type: String, default: '' },

    oldValue: { type: Schema.Types.Mixed, default: null },
    newValue: { type: Schema.Types.Mixed, default: null },

    description: { type: String, default: '' },
    status: { type: String, enum: ['success', 'failure'], default: 'success' },

    ipAddress: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    method: { type: String, default: '' },
    path: { type: String, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

auditLogSchema.plugin(toJSONPlugin);
auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });

const reject = function reject(next) {
  next(new Error('Audit log entries are immutable'));
};
['updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany', 'findOneAndDelete'].forEach((op) => {
  auditLogSchema.pre(op, reject);
});

module.exports = mongoose.model('AuditLog', auditLogSchema);
