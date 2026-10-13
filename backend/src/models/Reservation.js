const mongoose = require('mongoose');
const { toJSONPlugin } = require('./plugins/common');
const { RESERVATION_STATUS } = require('../constants/enums');

const { Schema } = mongoose;

/**
 * A hold placed on a title. Queue position is derived from `createdAt` among
 * pending reservations, so the head of the queue is always the oldest request.
 */
const reservationSchema = new Schema(
  {
    reservationCode: { type: String, required: true, unique: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    resource: { type: Schema.Types.ObjectId, ref: 'Resource', required: true, index: true },
    // Set when a returned copy is allocated to this reservation.
    copy: { type: Schema.Types.ObjectId, ref: 'ResourceCopy', default: null },

    status: { type: String, enum: RESERVATION_STATUS, default: 'pending', index: true },
    queuePosition: { type: Number, default: 0 },

    reservedAt: { type: Date, default: Date.now },
    readyAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null, index: true },
    fulfilledAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    cancelledBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    cancelReason: { type: String, trim: true, default: '' },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    notes: { type: String, trim: true, default: '' },
  },
  { timestamps: true },
);

reservationSchema.plugin(toJSONPlugin);

reservationSchema.index({ resource: 1, status: 1, createdAt: 1 });
reservationSchema.index({ user: 1, status: 1 });
// A user may only hold one open reservation per title.
reservationSchema.index(
  { user: 1, resource: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ['pending', 'ready'] } }, name: 'one_open_hold_per_title' },
);

module.exports = mongoose.model('Reservation', reservationSchema);
