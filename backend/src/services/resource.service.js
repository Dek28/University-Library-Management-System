const mongoose = require('mongoose');
const Resource = require('../models/Resource');
const ResourceCopy = require('../models/ResourceCopy');
const Loan = require('../models/Loan');
const { Shelf } = require('../models/reference');
const Reservation = require('../models/Reservation');
const ApiError = require('../utils/ApiError');
const auditService = require('./audit.service');
const authorService = require('./author.service');
const storage = require('./storage');
const { buildPagination, paginate, compact, like, escapeRegex } = require('../utils/query');

const DETAIL_POPULATE = [
  { path: 'authors', select: 'firstName lastName fullName' },
  { path: 'publisher', select: 'name country' },
  { path: 'category', select: 'name' },
  { path: 'subjects', select: 'name' },
  { path: 'department', select: 'code name' },
  { path: 'faculty', select: 'code name' },
  { path: 'language', select: 'name' },
  { path: 'shelf', select: 'name section rack' },
];

const LIST_SELECT = 'title subtitle resourceType authors publisher publicationYear category status '
  + 'totalCopies availableCopies borrowedCopies coverImage isbn shelf borrowCount isBorrowable '
  + 'isReferenceOnly createdAt';

const LIST_POPULATE = [
  { path: 'authors', select: 'fullName' },
  { path: 'publisher', select: 'name' },
  { path: 'category', select: 'name' },
  { path: 'shelf', select: 'name section rack' },
];

/**
 * Builds the catalogue query.
 *
 * A free-text `search` uses the compound text index; identifier-style terms
 * (ISBN, accession number, barcode) fall back to exact indexed lookups so a
 * scanned barcode always resolves.
 */
async function buildSearchFilter(query = {}) {
  const filter = compact({
    resourceType: query.resourceType,
    category: query.category,
    department: query.department,
    faculty: query.faculty,
    publisher: query.publisher,
    language: query.language,
    status: query.status,
  });

  if (query.author) filter.authors = query.author;
  if (query.subject) filter.subjects = query.subject;
  if (query.isbn) filter.isbn = query.isbn.trim();

  if (query.yearFrom || query.yearTo) {
    filter.publicationYear = compact({
      $gte: query.yearFrom ? Number(query.yearFrom) : undefined,
      $lte: query.yearTo ? Number(query.yearTo) : undefined,
    });
  }

  if (query.availability === 'available') filter.availableCopies = { $gt: 0 };
  if (query.availability === 'unavailable') filter.availableCopies = { $lte: 0 };

  if (query.keyword) filter.keywords = String(query.keyword).toLowerCase().trim();

  // A copy identifier narrows the result set to that copy's title.
  if (query.accessionNumber || query.barcode) {
    const copy = await ResourceCopy.findOne(compact({
      accessionNumber: query.accessionNumber?.toUpperCase().trim(),
      barcode: query.barcode?.trim(),
    })).select('resource').lean();
    filter._id = copy ? copy.resource : new mongoose.Types.ObjectId();
  }

  return filter;
}

function textMatchers(term) {
  const value = String(term || '').trim();
  if (!value) return null;
  return {
    // Indexed, whole-word matching across title/subtitle/keywords/description.
    indexed: value.length >= 3 ? { $text: { $search: value } } : null,
    // Substring fallback, so partial terms and identifiers still resolve.
    substring: {
      $or: [
        { title: like(value) },
        { subtitle: like(value) },
        { keywords: like(value) },
        { isbn: value },
      ],
    },
  };
}

/**
 * Runs the catalogue search, preferring the text index and falling back to
 * substring matching when it returns nothing (e.g. a partial word).
 */
async function search(query = {}, options = {}) {
  const pagination = buildPagination(query, { defaultSort: '-createdAt', ...options });
  const base = await buildSearchFilter(query);
  const matchers = textMatchers(query.search || query.q);

  if (!matchers) {
    return paginate(Resource, base, pagination, { select: LIST_SELECT, populate: LIST_POPULATE });
  }

  if (matchers.indexed) {
    const result = await paginate(
      Resource,
      { ...base, ...matchers.indexed },
      pagination,
      { select: LIST_SELECT, populate: LIST_POPULATE },
    );
    if (result.total > 0) return result;
  }

  return paginate(
    Resource,
    { ...base, ...matchers.substring },
    pagination,
    { select: LIST_SELECT, populate: LIST_POPULATE },
  );
}

/** Lightweight suggestions for the search box. */
async function suggest(term, limit = 8) {
  const value = String(term || '').trim();
  if (value.length < 2) return [];
  const regex = new RegExp(escapeRegex(value), 'i');
  const [titles, authors] = await Promise.all([
    Resource.find({ title: regex }).select('title resourceType').limit(limit).lean(),
    require('../models/reference').Author.find({ fullName: regex }).select('fullName').limit(4).lean(),
  ]);
  return [
    ...titles.map((t) => ({ type: 'title', label: t.title, id: String(t._id), meta: t.resourceType })),
    ...authors.map((a) => ({ type: 'author', label: a.fullName, id: String(a._id) })),
  ];
}

async function getById(id, { includeCopies = false, trackView = false } = {}) {
  const resource = await Resource.findById(id).populate(DETAIL_POPULATE);
  if (!resource) throw ApiError.notFound('Catalogue record not found');

  if (trackView) {
    // Fire-and-forget: a view counter must never slow the response.
    Resource.updateOne({ _id: id }, { $inc: { viewCount: 1 } }).catch(() => {});
  }

  const result = resource.toJSON();
  if (includeCopies) {
    result.copiesList = await ResourceCopy.find({ resource: id })
      .populate('shelf', 'name section rack')
      .sort('accessionNumber')
      .lean();
  }
  result.activeReservations = await Reservation.countDocuments({ resource: id, status: { $in: ['pending', 'ready'] } });
  return result;
}

// How much each kind of overlap counts towards "related". An author link is
// the strongest signal; a shared shelf is mostly implied by the category.
const RELATED_WEIGHTS = { author: 5, category: 3, subject: 2, keyword: 1, shelf: 1 };
const RELATED_MAX_KEYWORDS = 3;
// Titles a reader cannot get hold of are not worth suggesting.
const RELATED_HIDDEN_STATUSES = ['withdrawn', 'lost'];
// Candidates scored per request; the most borrowed are kept if there are more.
const RELATED_POOL = 200;

const RELATED_REASONS = {
  author: 'Same author',
  category: 'Same category',
  subject: 'Same subject',
  keyword: 'Similar topic',
  shelf: 'Same shelf',
};

const countShared = (mine, theirs) => {
  const own = new Set(mine);
  return (theirs || []).filter((value) => own.has(String(value))).length;
};

/**
 * Titles ranked by how much they have in common with this one: shared
 * authors, category, subjects, keywords and shelf, each weighted. Ties go to
 * titles with a copy on the shelf, then the most borrowed. Each result
 * carries `relatedBecause`, the overlaps that earned it a place, strongest first.
 */
async function related(id, limit = 6) {
  const resource = await Resource.findById(id).select('category authors subjects keywords shelf').lean();
  if (!resource) throw ApiError.notFound('Catalogue record not found');

  const authors = (resource.authors || []).map(String);
  const subjects = (resource.subjects || []).map(String);
  const keywords = resource.keywords || [];
  const category = resource.category ? String(resource.category) : null;
  const shelf = resource.shelf ? String(resource.shelf) : null;

  const matchers = [];
  if (authors.length) matchers.push({ authors: { $in: resource.authors } });
  if (category) matchers.push({ category: resource.category });
  if (subjects.length) matchers.push({ subjects: { $in: resource.subjects } });
  if (keywords.length) matchers.push({ keywords: { $in: keywords } });
  if (shelf) matchers.push({ shelf: resource.shelf });
  if (!matchers.length) return [];

  const candidates = await Resource.find({
    _id: { $ne: resource._id },
    status: { $nin: RELATED_HIDDEN_STATUSES },
    $or: matchers,
  })
    .select('title category authors subjects keywords shelf availableCopies borrowCount')
    .sort('-borrowCount')
    .limit(RELATED_POOL)
    .lean();

  const ranked = candidates.map((candidate) => {
    const overlap = {
      author: countShared(authors, candidate.authors),
      category: category && String(candidate.category) === category ? 1 : 0,
      subject: countShared(subjects, candidate.subjects),
      keyword: Math.min(countShared(keywords, candidate.keywords), RELATED_MAX_KEYWORDS),
      shelf: shelf && String(candidate.shelf) === shelf ? 1 : 0,
    };
    const score = Object.entries(overlap).reduce((sum, [kind, n]) => sum + n * RELATED_WEIGHTS[kind], 0);
    const reasons = Object.keys(RELATED_WEIGHTS) // already strongest first
      .filter((kind) => overlap[kind] > 0)
      .map((kind) => RELATED_REASONS[kind]);
    return { candidate, score, reasons };
  });

  ranked.sort((a, b) => b.score - a.score
    || Number(b.candidate.availableCopies > 0) - Number(a.candidate.availableCopies > 0)
    || (b.candidate.borrowCount || 0) - (a.candidate.borrowCount || 0)
    || String(a.candidate.title).localeCompare(String(b.candidate.title)));

  const top = ranked.slice(0, limit);
  const records = await Resource.find({ _id: { $in: top.map((entry) => entry.candidate._id) } })
    .select(LIST_SELECT)
    .populate(LIST_POPULATE)
    .lean();
  const byId = new Map(records.map((record) => [String(record._id), record]));

  return top
    .map(({ candidate, reasons }) => {
      const record = byId.get(String(candidate._id));
      return record && { ...record, relatedBecause: reasons };
    })
    .filter(Boolean);
}

const recentlyAdded = (limit = 8) =>
  Resource.find().sort('-createdAt').limit(limit).select(LIST_SELECT).populate(LIST_POPULATE).lean();

const mostBorrowed = (limit = 8) =>
  Resource.find({ borrowCount: { $gt: 0 } }).sort('-borrowCount').limit(limit)
    .select(LIST_SELECT).populate(LIST_POPULATE).lean();

/** Replaces typed `authorNames` with the matching (or newly registered) Author ids. */
async function resolveAuthors(payload, actor, context) {
  const { authorNames, ...rest } = payload;
  if (authorNames === undefined) return rest;
  return { ...rest, authors: await authorService.findOrCreateByNames(authorNames, actor, context) };
}

async function create(rawPayload, actor, context = {}) {
  const payload = await resolveAuthors(rawPayload, actor, context);
  const resource = await Resource.create({
    ...payload,
    keywords: (payload.keywords || []).map((k) => String(k).toLowerCase().trim()).filter(Boolean),
    createdBy: actor?._id,
    updatedBy: actor?._id,
  });
  await auditService.record({
    ...context, actor, action: 'resource_created', entityType: 'Resource', entityId: resource._id,
    entityLabel: resource.title, newValue: resource.toObject(),
  });
  return getById(resource._id);
}

async function update(id, rawPayload, actor, context = {}) {
  const resource = await Resource.findById(id);
  if (!resource) throw ApiError.notFound('Catalogue record not found');
  const payload = await resolveAuthors(rawPayload, actor, context);
  const before = resource.toObject();

  if (payload.keywords) {
    payload.keywords = payload.keywords.map((k) => String(k).toLowerCase().trim()).filter(Boolean);
  }
  // Copy counters are derived, never client-supplied.
  const { totalCopies, availableCopies, borrowedCopies, borrowCount, ...safe } = payload;

  const shelfChanged = Object.prototype.hasOwnProperty.call(safe, 'shelf')
    && String(safe.shelf || '') !== String(resource.shelf || '');

  resource.set({ ...safe, updatedBy: actor?._id });
  await resource.save();

  // Moving a title to another shelf moves its copies with it.
  if (shelfChanged) {
    const shelf = safe.shelf ? await Shelf.findById(safe.shelf).lean() : null;
    await ResourceCopy.updateMany(
      { resource: id },
      { $set: { shelf: shelf?._id || null, section: shelf?.section || '', rack: shelf?.rack || '' } },
    );
  }

  await auditService.record({
    ...context, actor, action: 'resource_updated', entityType: 'Resource', entityId: resource._id,
    entityLabel: resource.title, oldValue: before, newValue: resource.toObject(),
  });
  return getById(id);
}

async function remove(id, actor, context = {}) {
  const resource = await Resource.findById(id);
  if (!resource) throw ApiError.notFound('Catalogue record not found');

  const openLoans = await Loan.countDocuments({ resource: id, status: { $in: ['active', 'overdue'] } });
  if (openLoans > 0) {
    throw ApiError.conflict(`Cannot delete: ${openLoans} copy/copies are currently on loan.`);
  }

  // Copies go with the title so no orphaned inventory remains searchable.
  await ResourceCopy.updateMany(
    { resource: id },
    { $set: { isDeleted: true, deletedAt: new Date(), deletedBy: actor?._id } },
  );
  await resource.softDelete(actor?._id);

  await auditService.record({
    ...context, actor, action: 'resource_deleted', entityType: 'Resource', entityId: resource._id,
    entityLabel: resource.title,
  });
  return true;
}

async function setCoverImage(id, file, actor, context = {}) {
  const resource = await Resource.findById(id);
  if (!resource) throw ApiError.notFound('Catalogue record not found');

  const extension = (file.originalname.match(/\.[a-z0-9]+$/i) || ['.jpg'])[0].toLowerCase();
  const saved = await storage.save(file.buffer, { key: `covers/${resource._id}${extension}` });

  resource.coverImage = storage.publicUrl(saved.key);
  resource.updatedBy = actor?._id;
  await resource.save();

  await auditService.record({
    ...context, actor, action: 'resource_updated', entityType: 'Resource', entityId: resource._id,
    entityLabel: resource.title, description: 'Cover image updated',
  });
  return resource.coverImage;
}

/**
 * Recomputes a title's copy counters from the copies themselves.
 * Called after every inventory or circulation change.
 */
async function syncAvailability(resourceId, session = null) {
  const options = session ? { session } : {};
  const counts = await ResourceCopy.aggregate([
    { $match: { resource: new mongoose.Types.ObjectId(String(resourceId)), isDeleted: { $ne: true } } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        available: { $sum: { $cond: [{ $eq: ['$status', 'available'] }, 1, 0] } },
        borrowed: { $sum: { $cond: [{ $eq: ['$status', 'borrowed'] }, 1, 0] } },
      },
    },
  ]).option(options);

  const { total = 0, available = 0, borrowed = 0 } = counts[0] || {};
  const resource = await Resource.findById(resourceId).setOptions(options);
  if (!resource) return null;

  resource.totalCopies = total;
  resource.availableCopies = available;
  resource.borrowedCopies = borrowed;

  // Keep the headline status coherent with the stock, without clobbering the
  // deliberate states a librarian sets by hand.
  if (!['withdrawn', 'under_maintenance', 'reference_only', 'digital_only'].includes(resource.status)) {
    if (total === 0) resource.status = 'digital_only';
    else if (available > 0) resource.status = 'available';
    else if (borrowed > 0) resource.status = 'borrowed';
    else resource.status = 'under_maintenance';
  }

  await resource.save(options);
  return resource;
}

module.exports = {
  search, suggest, getById, related, recentlyAdded, mostBorrowed,
  create, update, remove, setCoverImage, syncAvailability,
  DETAIL_POPULATE, LIST_SELECT, LIST_POPULATE, buildSearchFilter,
};