const mongoose = require('mongoose');
const { toJSONPlugin } = require('./plugins/common');
const { ALL_PERMISSIONS } = require('../constants/permissions');

const roleSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    // Higher level = more authority. Used to stop a role escalating past itself.
    level: { type: Number, default: 10, min: 0, max: 100 },
    permissions: [{ type: String, enum: ALL_PERMISSIONS }],
    isSystem: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

roleSchema.plugin(toJSONPlugin);

module.exports = mongoose.model('Role', roleSchema);
