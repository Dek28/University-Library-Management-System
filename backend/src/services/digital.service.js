const crypto = require('crypto');
const DigitalResource = require('../models/DigitalResource');
const ApiError = require('../utils/ApiError');
const auditService = require('./audit.service');
const settingsService = require('./settings.service');
const storage = require('./storage');
const { buildPagination, paginate, compact, like } = require('../utils/query');
const { ROLE_KEYS } = require('../constants/permissions');

const POPULATE = [
  { path: 'department', select: 'code name' },
  { path: 'faculty', select: 'code name' },
  { path: 'uploadedBy', select: 'firstName lastName' },
  { path: 'language', select: 'name' },
];

// Never expose the storage key: the file is only reachable through the
// authorised download endpoint.
const SAFE_SELECT = '-storageKey';

/** Role keys permitted by each access level. */
const ACCESS_MATRIX = {
  public: null, // everyone, including unauthenticated readers
  university: [ROLE_KEYS.STUDENT, ROLE_KEYS.LECTURER, ROLE_KEYS.LIBRARIAN, ROLE_KEYS.ADMIN, ROLE_KEYS.SUPER_ADMIN],
  students: [ROLE_KEYS.STUDENT, ROLE_KEYS.LIBRARIAN, ROLE_KEYS.ADMIN, ROLE_KEYS.SUPER_ADMIN],
  staff: [ROLE_KEYS.LECTURER, ROLE_KEYS.LIBRARIAN, ROLE_KEYS.ADMIN, ROLE_KEYS.SUPER_ADMIN],
  librarians: [ROLE_KEYS.LIBRARIAN, ROLE_KEYS.ADMIN, ROLE_KEYS.SUPER_ADMIN],
  restricted: [ROLE_KEYS.ADMIN, ROLE_KEYS.SUPER_ADMIN],
};

/**
 * Single source of truth for repository access.
 *
 * Applied both when listing (as a query filter) and when streaming a file, so
 * an item that never appears in a listing can never be fetched by id either.
 */
function canAccess(item, user) {
  if (!item.isPublished && String(item.uploadedBy?._id || item.uploadedBy) !== String(user?._id)) {
    // Unpublished items are visible only to their uploader and to managers.
    if (![ROLE_KEYS.LIBRARIAN, ROLE_KEYS.ADMIN, ROLE_KEYS.SUPER_ADMIN].includes(user?.roleKey)) return false;
  }
  if (item.accessLevel === 'public') return true;
  if (!user) return false;
  if (item.allowedRoles?.length && item.allowedRoles.includes(user.roleKey)) return true;
  const allowed = ACCESS_MATRIX[item.accessLevel] || [];
  return allowed.includes(user.roleKey);
}

/** Mongo filter expressing what `user` is allowed to see. */
function accessFilter(user) {
  if (!user) return { accessLevel: 'public', isPublished: true };
  if ([ROLE_KEYS.ADMIN, ROLE_KEYS.SUPER_ADMIN].includes(user.roleKey)) return {};

  const levels = Object.entries(ACCESS_MATRIX)
    .filter(([level, roles]) => level === 'public' || (roles || []).includes(user.roleKey))
    .map(([level]) => level);

  return {
    $or: [
      { accessLevel: { $in: levels }, isPublished: true },
      { allowedRoles: user.roleKey, isPublished: true },
      { uploadedBy: user._id },
    ],
  };
}

async function list(query = {}, user) {
  const pagination = buildPagination(query, { defaultSort: '-createdAt' });
  const filter = {
    ...accessFilter(user),
    ...compact({
      resourceType: query.resourceType,
      department: query.department,
      faculty: query.faculty,
      accessLevel: query.accessLevel,
      year: query.year ? Number(query.year) : undefined,
    }),
  };

  if (query.yearFrom || query.yearTo) {
    filter.year = compact({
      $gte: query.yearFrom ? Number(query.yearFrom) : undefined,
      $lte: query.yearTo ? Number(query.yearTo) : undefined,
    });
  }
  if (query.search) {
    const conditions = [
      { title: like(query.search) },
      { authorNames: like(query.search) },
      { keywords: String(query.search).toLowerCase() },
      { supervisor: like(query.search) },
    ];
    // Preserve the access filter's own $or by combining with $and.
    if (filter.$or) {
      filter.$and = [{ $or: filter.$or }, { $or: conditions }];
      delete filter.$or;
    } else {
      filter.$or = conditions;
    }
  }

  return paginate(DigitalResource, filter, pagination, { select: SAFE_SELECT, populate: POPULATE });
}

async function getById(id, user, { trackView = false } = {}) {
  const item = await DigitalResource.findById(id).populate(POPULATE);
  if (!item) throw ApiError.notFound('Repository item not found');
  if (!canAccess(item, user)) {
    // Same message as a genuine miss: existence itself is not disclosed.
    throw ApiError.notFound('Repository item not found');
  }
  if (trackView) DigitalResource.updateOne({ _id: id }, { $inc: { viewCount: 1 } }).catch(() => {});

  const json = item.toJSON();
  delete json.storageKey;
  return json;
}

async function upload(payload, file, actor, context = {}) {
  if (!file) throw ApiError.badRequest('A document file is required');
  await settingsService.assertUploadAllowed(file, 'document');

  const extension = (file.originalname.match(/\.[a-z0-9]+$/i) || [''])[0].toLowerCase();
  const key = `digital/${new Date().getFullYear()}/${crypto.randomUUID()}${extension}`;
  const saved = await storage.save(file.buffer, { key });

  const item = await DigitalResource.create({
    ...payload,
    authorNames: payload.authorNames || [],
    keywords: (payload.keywords || []).map((k) => String(k).toLowerCase().trim()).filter(Boolean),
    storageDriver: saved.driver,
    storageKey: saved.key,
    originalName: file.originalname,
    mimeType: file.mimetype,
    fileSize: saved.size,
    checksum: saved.checksum,
    uploadedBy: actor._id,
    createdBy: actor._id,
    updatedBy: actor._id,
  });

  await auditService.record({
    ...context, actor, action: 'digital_uploaded', entityType: 'DigitalResource', entityId: item._id,
    entityLabel: item.title,
    newValue: { title: item.title, accessLevel: item.accessLevel, fileSize: item.fileSize },
  });

  return getById(item._id, { ...actor.toObject?.() || actor, roleKey: actor.roleKey });
}

async function update(id, payload, actor, context = {}) {
  const item = await DigitalResource.findById(id);
  if (!item) throw ApiError.notFound('Repository item not found');
  const before = item.toObject();

  // File identity fields are immutable; re-upload to replace a document.
  const { storageKey, storageDriver, fileSize, checksum, mimeType, uploadedBy, ...safe } = payload;
  if (safe.keywords) safe.keywords = safe.keywords.map((k) => String(k).toLowerCase().trim()).filter(Boolean);
  item.set({ ...safe, updatedBy: actor._id });
  await item.save();

  await auditService.record({
    ...context, actor, action: 'digital_updated', entityType: 'DigitalResource', entityId: item._id,
    entityLabel: item.title, oldValue: before, newValue: item.toObject(),
  });
  return getById(id, actor);
}

async function remove(id, actor, context = {}) {
  const item = await DigitalResource.findById(id);
  if (!item) throw ApiError.notFound('Repository item not found');
  // The record is soft-deleted; the blob stays until an operator purges it, so
  // an accidental deletion is recoverable.
  await item.softDelete(actor._id);
  await auditService.record({
    ...context, actor, action: 'digital_deleted', entityType: 'DigitalResource', entityId: item._id,
    entityLabel: item.title,
  });
  return true;
}

/**
 * Resolves an item to a readable stream after re-checking access.
 *
 * `purpose` is 'download' (save a copy) or 'read' (view it inside the app).
 * Reading is allowed even when downloads are switched off for the item; only
 * downloads count towards `downloadCount`. Both are written to the audit trail.
 */
async function openStream(id, user, context = {}, { purpose = 'download' } = {}) {
  const item = await DigitalResource.findById(id).select('+storageKey').populate('uploadedBy', '_id');
  if (!item) throw ApiError.notFound('Repository item not found');
  if (!canAccess(item, user)) throw ApiError.notFound('Repository item not found');
  if (purpose === 'download' && !item.isDownloadable
    && ![ROLE_KEYS.LIBRARIAN, ROLE_KEYS.ADMIN, ROLE_KEYS.SUPER_ADMIN].includes(user?.roleKey)) {
    throw ApiError.forbidden('This item is available for reading only, not download');
  }

  const exists = await storage.exists(item.storageKey, item.storageDriver);
  if (!exists) throw ApiError.notFound('The stored file is missing. Contact the library.');

  if (purpose === 'download') {
    await DigitalResource.updateOne({ _id: id }, { $inc: { downloadCount: 1 } });
  }
  await auditService.record({
    ...context,
    actor: user,
    action: purpose === 'read' ? 'digital_read' : 'digital_downloaded',
    entityType: 'DigitalResource',
    entityId: item._id,
    entityLabel: item.title,
  });

  return {
    stream: storage.stream(item.storageKey, item.storageDriver),
    filename: item.originalName,
    mimeType: item.mimeType,
    fileSize: item.fileSize,
  };
}

module.exports = { list, getById, upload, update, remove, openStream, canAccess, accessFilter, ACCESS_MATRIX };
