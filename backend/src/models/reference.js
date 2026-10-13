/**
 * Reference/lookup collections.
 *
 * These are the configurable vocabularies the catalogue and user records point
 * at. They share a small base shape (name + active flag) so the generic
 * reference controller can serve all of them with one set of handlers.
 *
 * Only faculties, departments and programs carry a short `code`: the student
 * import matches on it. Everything else is identified by its name.
 */
const mongoose = require('mongoose');
const { toJSONPlugin, softDeletePlugin, authorshipPlugin } = require('./plugins/common');

const { Schema } = mongoose;

function baseReferenceSchema(extra = {}, { withCode = false, withDescription = true } = {}) {
  const schema = new Schema(
    {
      ...(withCode && { code: { type: String, required: true, trim: true, uppercase: true } }),
      name: { type: String, required: true, trim: true },
      ...(withDescription && { description: { type: String, trim: true, default: '' } }),
      isActive: { type: Boolean, default: true, index: true },
      ...extra,
    },
    { timestamps: true },
  );
  schema.plugin(toJSONPlugin);
  schema.plugin(softDeletePlugin);
  schema.plugin(authorshipPlugin);
  if (withCode) schema.index({ code: 1 });
  schema.index({ name: 1 });
  return schema;
}

const facultySchema = baseReferenceSchema({
  dean: { type: String, trim: true, default: '' },
}, { withCode: true });

const departmentSchema = baseReferenceSchema({
  faculty: { type: Schema.Types.ObjectId, ref: 'Faculty', required: true, index: true },
  head: { type: String, trim: true, default: '' },
}, { withCode: true });

const programSchema = baseReferenceSchema({
  department: { type: Schema.Types.ObjectId, ref: 'Department', required: true, index: true },
  level: { type: String, enum: ['certificate', 'diploma', 'bachelor', 'master', 'phd', 'other'], default: 'bachelor' },
  durationYears: { type: Number, min: 1, max: 10, default: 3 },
}, { withCode: true });

const categorySchema = baseReferenceSchema({
  parent: { type: Schema.Types.ObjectId, ref: 'Category', default: null },
  deweyRange: { type: String, trim: true, default: '' },
}, { withDescription: false });

const subjectSchema = baseReferenceSchema({
  category: { type: Schema.Types.ObjectId, ref: 'Category', default: null, index: true },
}, { withDescription: false });

const publisherSchema = baseReferenceSchema({
  country: { type: String, trim: true, default: '' },
  website: { type: String, trim: true, default: '' },
  contactEmail: { type: String, trim: true, lowercase: true, default: '' },
});

const languageSchema = baseReferenceSchema({}, { withDescription: false });

/**
 * A shelf is identified by its section and rack. Its `name` is derived from
 * them (e.g. "Computing · Rack R1") so every screen that shows a shelf name
 * stays readable without a separate label to maintain.
 */
const shelfSchema = baseReferenceSchema({
  section: { type: String, trim: true, default: '' },
  rack: { type: String, trim: true, default: '' },
}, { withDescription: false });

shelfSchema.statics.nameFor = (section, rack) => {
  const rackLabel = /^rack\b/i.test(rack) ? rack : `Rack ${rack}`;
  return [section, rack && rackLabel].filter(Boolean).join(' · ');
};

/** Display label for a (possibly populated/lean) shelf; older shelves fall back to their name. */
shelfSchema.statics.labelOf = (shelf) => {
  if (!shelf) return '';
  return shelf.section && shelf.rack ? shelfSchema.statics.nameFor(shelf.section, shelf.rack) : shelf.name || '';
};

shelfSchema.pre('validate', function deriveShelfName(next) {
  // Older shelves predate section/rack; keep their name until they are given one.
  if (this.section || this.rack) this.name = this.constructor.nameFor(this.section, this.rack);
  next();
});

const studySpaceSchema = baseReferenceSchema({
  spaceType: { type: String, enum: ['room', 'table', 'carrel', 'hall'], default: 'table' },
  capacity: { type: Number, min: 1, default: 6 },
  location: { type: String, trim: true, default: '' },
});

const authorSchema = new Schema(
  {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    fullName: { type: String, trim: true, index: true },
    biography: { type: String, trim: true, default: '' },
    nationality: { type: String, trim: true, default: '' },
    birthYear: { type: Number, default: null },
    deathYear: { type: Number, default: null },
    affiliation: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, lowercase: true, default: '' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);
authorSchema.plugin(toJSONPlugin);
authorSchema.plugin(softDeletePlugin);
authorSchema.plugin(authorshipPlugin);
authorSchema.index({ fullName: 'text', lastName: 'text' }, { name: 'author_text_search' });
authorSchema.pre('save', function setFullName(next) {
  this.fullName = `${this.firstName} ${this.lastName}`.trim();
  next();
});

const Faculty = mongoose.model('Faculty', facultySchema);
const Department = mongoose.model('Department', departmentSchema);
const Program = mongoose.model('Program', programSchema);
const Category = mongoose.model('Category', categorySchema);
const Subject = mongoose.model('Subject', subjectSchema);
const Publisher = mongoose.model('Publisher', publisherSchema);
const Language = mongoose.model('Language', languageSchema);
const Shelf = mongoose.model('Shelf', shelfSchema);
const StudySpace = mongoose.model('StudySpace', studySpaceSchema);
const Author = mongoose.model('Author', authorSchema);

module.exports = {
  Faculty, Department, Program, Category, Subject,
  Publisher, Language, Shelf, StudySpace, Author,
};
