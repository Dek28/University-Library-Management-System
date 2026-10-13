const models = require('../models/reference');
const Resource = require('../models/Resource');
const ResourceCopy = require('../models/ResourceCopy');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const auditService = require('./audit.service');
const { buildPagination, paginate, compact, like, escapeRegex } = require('../utils/query');

/**
 * Shelves are identified by section + rack: both are required, and the pair
 * must be unique among shelves that have not been deleted.
 */
async function prepareShelf(payload, existing) {
  // Shelves carry no code or free-text name/description of their own.
  const { code, name, description, ...rest } = payload;

  // An update that leaves the location alone (e.g. deactivating) needs no check.
  const touchesLocation = payload.section !== undefined || payload.rack !== undefined;
  if (existing && !touchesLocation) return rest;

  const section = payload.section ?? existing?.section ?? '';
  const rack = payload.rack ?? existing?.rack ?? '';
  if (!section.trim() || !rack.trim()) {
    throw ApiError.badRequest('A shelf needs both a section name and a rack number');
  }
  const exact = (value) => new RegExp(`^${escapeRegex(value.trim())}$`, 'i');
  const clash = await models.Shelf.findOne({
    section: exact(section), rack: exact(rack), ...(existing && { _id: { $ne: existing._id } }),
  });
  if (clash) throw ApiError.conflict(`Rack "${rack}" in section "${section}" is already registered`);
  return rest;
}

/** Collections other than faculties, departments and programs have no code. */
const withoutCode = (payload) => {
  const { code, ...rest } = payload;
  return rest;
};

/** Categories, languages and subjects have no code and no description. */
const nameOnly = (payload) => {
  const { code, description, ...rest } = payload;
  return rest;
};

/**
 * Registry of the configurable lookup collections.
 *
 * `blockedBy` lists the references that must be clear before a record may be
 * deleted, which is how the system refuses to orphan catalogue or user data.
 */
const REGISTRY = {
  faculties: {
    model: models.Faculty,
    label: 'Faculty',
    searchFields: ['code', 'name', 'dean'],
    populate: null,
    blockedBy: [
      { model: () => models.Department, field: 'faculty', label: 'departments' },
      { model: () => User, field: 'faculty', label: 'members' },
    ],
  },
  departments: {
    model: models.Department,
    label: 'Department',
    searchFields: ['code', 'name', 'head'],
    populate: { path: 'faculty', select: 'code name' },
    filters: ['faculty'],
    blockedBy: [
      { model: () => models.Program, field: 'department', label: 'programs' },
      { model: () => User, field: 'department', label: 'members' },
      { model: () => Resource, field: 'department', label: 'catalogue records' },
    ],
  },
  programs: {
    model: models.Program,
    label: 'Program',
    searchFields: ['code', 'name'],
    populate: { path: 'department', select: 'code name' },
    filters: ['department', 'level'],
    blockedBy: [{ model: () => User, field: 'program', label: 'members' }],
  },
  categories: {
    model: models.Category,
    label: 'Category',
    searchFields: ['name', 'deweyRange'],
    populate: { path: 'parent', select: 'name' },
    filters: ['parent'],
    prepare: nameOnly,
    blockedBy: [{ model: () => Resource, field: 'category', label: 'catalogue records' }],
  },
  subjects: {
    model: models.Subject,
    label: 'Subject',
    searchFields: ['name'],
    populate: { path: 'category', select: 'name' },
    filters: ['category'],
    prepare: nameOnly,
    blockedBy: [{ model: () => Resource, field: 'subjects', label: 'catalogue records' }],
  },
  publishers: {
    model: models.Publisher,
    label: 'Publisher',
    searchFields: ['name', 'country'],
    prepare: withoutCode,
    blockedBy: [{ model: () => Resource, field: 'publisher', label: 'catalogue records' }],
  },
  languages: {
    model: models.Language,
    label: 'Language',
    searchFields: ['name'],
    prepare: nameOnly,
    blockedBy: [{ model: () => Resource, field: 'language', label: 'catalogue records' }],
  },
  shelves: {
    model: models.Shelf,
    label: 'Shelf',
    searchFields: ['name', 'section', 'rack'],
    filters: ['section'],
    defaultSort: 'section rack',
    prepare: prepareShelf,
    blockedBy: [{ model: () => ResourceCopy, field: 'shelf', label: 'copies' }],
  },
  'study-spaces': {
    model: models.StudySpace,
    label: 'Study space',
    searchFields: ['name', 'location'],
    filters: ['spaceType'],
    prepare: withoutCode,
    blockedBy: [],
  },
};

function getEntry(collection) {
  const entry = REGISTRY[collection];
  if (!entry) throw ApiError.notFound(`Unknown reference collection "${collection}"`);
  return entry;
}

const collections = () =>
  Object.entries(REGISTRY).map(([key, value]) => ({ key, label: value.label }));

async function list(collection, query = {}) {
  const entry = getEntry(collection);
  const pagination = buildPagination(query, { defaultSort: entry.defaultSort || 'name', defaultLimit: 50 });

  const filter = {};
  (entry.filters || []).forEach((field) => {
    if (query[field]) filter[field] = query[field];
  });
  if (query.isActive !== undefined) filter.isActive = query.isActive === 'true' || query.isActive === true;
  if (query.search) {
    filter.$or = entry.searchFields.map((f) => ({ [f]: like(query.search) }));
  }

  return paginate(entry.model, compact(filter), pagination, { populate: entry.populate || undefined });
}

async function getById(collection, id) {
  const entry = getEntry(collection);
  const doc = entry.populate
    ? await entry.model.findById(id).populate(entry.populate)
    : await entry.model.findById(id);
  if (!doc) throw ApiError.notFound(`${entry.label} not found`);
  return doc;
}

async function create(collection, payload, actor, context = {}) {
  const entry = getEntry(collection);
  const values = entry.prepare ? await entry.prepare(payload, null) : payload;
  const doc = await entry.model.create({ ...values, createdBy: actor?._id, updatedBy: actor?._id });
  await auditService.record({
    ...context, actor, action: 'reference_created', entityType: entry.label, entityId: doc._id,
    entityLabel: doc.name || doc.fullName, newValue: doc.toObject(),
  });
  return getById(collection, doc._id);
}

async function update(collection, id, payload, actor, context = {}) {
  const entry = getEntry(collection);
  const doc = await entry.model.findById(id);
  if (!doc) throw ApiError.notFound(`${entry.label} not found`);
  const before = doc.toObject();
  const values = entry.prepare ? await entry.prepare(payload, doc) : payload;
  doc.set({ ...values, updatedBy: actor?._id });
  await doc.save();
  await auditService.record({
    ...context, actor, action: 'reference_updated', entityType: entry.label, entityId: doc._id,
    entityLabel: doc.name || doc.fullName, oldValue: before, newValue: doc.toObject(),
  });
  return getById(collection, id);
}

/** Soft deletes a lookup record, refusing when live records still point at it. */
async function remove(collection, id, actor, context = {}) {
  const entry = getEntry(collection);
  const doc = await entry.model.findById(id);
  if (!doc) throw ApiError.notFound(`${entry.label} not found`);

  for (const dependency of entry.blockedBy || []) {
    const Model = dependency.model();
    // eslint-disable-next-line no-await-in-loop
    const count = await Model.countDocuments({ [dependency.field]: doc._id });
    if (count > 0) {
      throw ApiError.conflict(
        `Cannot delete this ${entry.label.toLowerCase()}: ${count} ${dependency.label} still reference it. `
        + 'Deactivate it instead.',
      );
    }
  }

  await doc.softDelete(actor?._id);
  await auditService.record({
    ...context, actor, action: 'reference_deleted', entityType: entry.label, entityId: doc._id,
    entityLabel: doc.name || doc.fullName,
  });
  return true;
}

module.exports = { REGISTRY, getEntry, collections, list, getById, create, update, remove };
