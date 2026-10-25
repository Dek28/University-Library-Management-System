const mongoose = require('mongoose');
const { toJSONPlugin } = require('./plugins/common');
const { NOTIFICATION_TYPES } = require('../constants/enums');

const { Schema } = mongoose;

/**
 * In-app notification. `channels` records which delivery channels were
 * attempted so email/SMS transports can be added later without a schema change.
 */
const notificationSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true, index: true },
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    severity: { type: String, enum: ['info', 'warning', 'critical'], default: 'info' },

    entityType: { type: String, default: null },
    entityId: { type: Schema.Types.ObjectId, default: null },
    link: { type: String, default: null },

    isRead: { type: Boolean, default: false, index: true },
    readAt: { type: Date, default: null },

    channels: [{
      channel: { type: String, enum: ['in_app', 'email', 'sms', 'whatsapp'], default: 'in_app' },
      status: { type: String, enum: ['pending', 'sent', 'failed', 'skipped'], default: 'sent' },
      sentAt: { type: Date, default: Date.now },
      error: { type: String, default: '' },
    }],
    // Guards against a nightly job re-sending the same reminder.
    dedupeKey: { type: String },
  },
  { timestamps: true },
);

notificationSchema.plugin(toJSONPlugin);
notificationSchema.index({ user: 1, isRead: 1, createdAt: -1 });
// Partial rather than sparse: a sparse index still treats an explicit null as a
// value, so a second notification without a key would be rejected as a duplicate.
notificationSchema.index(
  { dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } }, name: 'unique_dedupe_key' },
);

module.exports = mongoose.model('Notification', notificationSchema);
