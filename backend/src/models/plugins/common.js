/**
 * Shared schema plugins.
 *
 * `softDeletePlugin` keeps historical records addressable while hiding them
 * from ordinary queries. `toJSONPlugin` normalises the wire format (id instead
 * of _id, no __v) so controllers never leak Mongo internals.
 */

function toJSONPlugin(schema) {
  schema.set('toJSON', {
    virtuals: true,
    versionKey: false,
    transform(doc, ret) {
      ret.id = ret._id ? String(ret._id) : ret.id;
      delete ret._id;
      // Never serialise secrets even if a caller forgets to `.select('-x')`.
      delete ret.password;
      delete ret.passwordResetTokenHash;
      delete ret.tokenHash;
      return ret;
    },
  });
  schema.set('toObject', { virtuals: true });
}

function softDeletePlugin(schema) {
  schema.add({
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: require('mongoose').Schema.Types.ObjectId, ref: 'User', default: null },
  });

  // Hide soft-deleted documents unless a query opts in with
  // `.setOptions({ withDeleted: true })` or filters on isDeleted explicitly.
  const guard = function guard(next) {
    const filter = this.getFilter ? this.getFilter() : {};
    if (!this.getOptions().withDeleted && filter.isDeleted === undefined) {
      this.where({ isDeleted: { $ne: true } });
    }
    next();
  };

  ['find', 'findOne', 'findOneAndUpdate', 'countDocuments', 'updateMany', 'updateOne'].forEach((hook) => {
    schema.pre(hook, guard);
  });

  schema.methods.softDelete = function softDelete(userId) {
    this.isDeleted = true;
    this.deletedAt = new Date();
    this.deletedBy = userId || null;
    return this.save();
  };
}

/** Adds createdBy/updatedBy provenance fields. */
function authorshipPlugin(schema) {
  const { Schema } = require('mongoose');
  schema.add({
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  });
}

module.exports = { toJSONPlugin, softDeletePlugin, authorshipPlugin };
