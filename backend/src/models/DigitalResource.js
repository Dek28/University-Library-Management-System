const mongoose = require('mongoose');
const { toJSONPlugin, softDeletePlugin, authorshipPlugin } = require('./plugins/common');
const { RESOURCE_TYPES, ACCESS_LEVELS } = require('../constants/enums');

const { Schema } = mongoose;

/**
 * An item in the institutional repository.
 *
 * `storageKey` is deliberately opaque and never returned to clients: files are
 * only ever streamed through the authorised download endpoint, so guessing a
 * URL cannot bypass `accessLevel`.
 */
const digitalSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    authorNames: [{ type: String, trim: true }],
    authors: [{ type: Schema.Types.ObjectId, ref: 'Author' }],
    supervisor: { type: String, trim: true, default: '' },

    resourceType: { type: String, enum: RESOURCE_TYPES, required: true, index: true },
    resource: { type: Schema.Types.ObjectId, ref: 'Resource', default: null },

    year: { type: Number, min: 1400, max: 2200, index: true },
    faculty: { type: Schema.Types.ObjectId, ref: 'Faculty', default: null, index: true },
    department: { type: Schema.Types.ObjectId, ref: 'Department', default: null, index: true },
    abstract: { type: String, trim: true, default: '' },
    keywords: [{ type: String, trim: true, lowercase: true }],
    language: { type: Schema.Types.ObjectId, ref: 'Language', default: null },

    accessLevel: { type: String, enum: ACCESS_LEVELS, default: 'university', index: true },
    // Optional role keys allowed on top of the access level.
    allowedRoles: [{ type: String, trim: true }],
    isDownloadable: { type: Boolean, default: true },

    storageDriver: { type: String, default: 'local' },
    storageKey: { type: String, required: true, select: false },
    originalName: { type: String, required: true },
    mimeType: { type: String, required: true },
    fileSize: { type: Number, required: true, min: 0 },
    checksum: { type: String, default: '' },

    externalUrl: { type: String, trim: true, default: '' },

    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    isPublished: { type: Boolean, default: true, index: true },
    downloadCount: { type: Number, default: 0, min: 0 },
    viewCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

digitalSchema.plugin(toJSONPlugin);
digitalSchema.plugin(softDeletePlugin);
digitalSchema.plugin(authorshipPlugin);

digitalSchema.index(
  { title: 'text', abstract: 'text', keywords: 'text', authorNames: 'text' },
  {
    name: 'digital_text_search',
    weights: { title: 10, keywords: 5, authorNames: 4, abstract: 1 },
    // `language` is a Language reference here, not a text analyser hint.
    language_override: 'textLanguage',
  },
);
digitalSchema.index({ accessLevel: 1, isPublished: 1 });
digitalSchema.index({ createdAt: -1 });

module.exports = mongoose.model('DigitalResource', digitalSchema);
