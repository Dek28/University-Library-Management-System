const mongoose = require('mongoose');

/**
 * Named sequence counters, e.g. `LN-20261011` for the loans issued that day.
 * Incremented with a single atomic `$inc`, so concurrent requests never get
 * the same number, even on a standalone server without transactions.
 */
const counterSchema = new mongoose.Schema(
  {
    _id: { type: String },
    seq: { type: Number, default: 0 },
  },
  { versionKey: false, timestamps: { createdAt: false, updatedAt: true } },
);

module.exports = mongoose.model('Counter', counterSchema);
