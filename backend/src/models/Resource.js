const mongoose = require('mongoose');
const { toJSONPlugin, softDeletePlugin, authorshipPlugin } = require('./plugins/common');
const { RESOURCE_TYPES, RESOURCE_STATUS } = require('../constants/enums');

const { Schema } = mongoose;

/**
 * A catalogue title. Physical stock lives in `ResourceCopy`, one document per
 * shelvable item, so availability is always derived from real copies rather
 * than a counter on the title.
 */
const resourceSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    subtitle: { type: String, trim: true, default: '' },

    isbn: { type: String, trim: true, default: null },
    doi: { type: String, trim: true, default: '' },

    shelf: { type: Schema.Types.ObjectId, ref: 'Shelf', default: null, index: true },

    resourceType: { type: String, enum: RESOURCE_TYPES, required: true, index: true },

    authors: [{ type: Schema.Types.ObjectId, ref: 'Author', index: true }],
    editors: [{ type: String, trim: true }],
    publisher: { type: Schema.Types.ObjectId, ref: 'Publisher', default: null, index: true },
    publicationYear: { type: Number, min: 1400, max: 2200, index: true },
    edition: { type: String, trim: true, default: '' },
    volume: { type: String, trim: true, default: '' },
    language: { type: Schema.Types.ObjectId, ref: 'Language', default: null },
    shelfLocation: { type: String, trim: true, maxlength: 100 },
    pages: { type: Number, min: 0, default: null },

    category: { type: Schema.Types.ObjectId, ref: 'Category', default: null, index: true },
    subjects: [{ type: Schema.Types.ObjectId, ref: 'Subject' }],
    department: { type: Schema.Types.ObjectId, ref: 'Department', default: null, index: true },
    faculty: { type: Schema.Types.ObjectId, ref: 'Faculty', default: null, index: true },
    keywords: [{ type: String, trim: true, lowercase: true }],

    description: { type: String, trim: true, default: '' },
    coverImage: { type: String, default: null },
    externalUrl: { type: String, trim: true, default: '' },

    acquisitionDate: { type: Date, default: null },
    acquisitionSource: { type: String, enum: ['purchase', 'donation', 'exchange', 'legal_deposit', 'internal', 'other'], default: 'purchase' },
    supplier: { type: String, trim: true, default: '' },
    purchasePrice: { type: Number, min: 0, default: 0 },
    replacementCost: { type: Number, min: 0, default: 0 },

    status: { type: String, enum: RESOURCE_STATUS, default: 'available', index: true },
    isBorrowable: { type: Boolean, default: true },
    isReferenceOnly: { type: Boolean, default: false },

    // Maintained by the copy service so listings avoid a per-row aggregation.
    totalCopies: { type: Number, default: 0, min: 0 },
    availableCopies: { type: Number, default: 0, min: 0 },
    borrowedCopies: { type: Number, default: 0, min: 0 },

    borrowCount: { type: Number, default: 0, min: 0, index: true },
    viewCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

resourceSchema.plugin(toJSONPlugin);
resourceSchema.plugin(softDeletePlugin);
resourceSchema.plugin(authorshipPlugin);

resourceSchema.index(
  { title: 'text', subtitle: 'text', description: 'text', keywords: 'text' },
  {
    name: 'resource_text_search',
    weights: { title: 10, subtitle: 5, keywords: 4, description: 1 },
    // `language` here is a reference to the Language collection, not a text
    // analyser hint, so point the override at a field we never populate.
    language_override: 'textLanguage',
  },
);
// MongoDB rejects `sparse` combined with a partial filter, so uniqueness is
// expressed with the filter alone: only string ISBNs participate, which lets
// any number of records carry a null ISBN.
resourceSchema.index(
  { isbn: 1 },
  { unique: true, partialFilterExpression: { isbn: { $type: 'string' } }, name: 'unique_isbn' },
);
resourceSchema.index({ resourceType: 1, status: 1 });
resourceSchema.index({ category: 1, publicationYear: -1 });
resourceSchema.index({ createdAt: -1 });

resourceSchema.virtual('copies', {
  ref: 'ResourceCopy',
  localField: '_id',
  foreignField: 'resource',
});

// Empty identifier strings would collide under a unique sparse index.
resourceSchema.pre('validate', function normaliseIdentifiers(next) {
  if (this.isbn === '') this.isbn = null;
  next();
});

module.exports = mongoose.model('Resource', resourceSchema);
