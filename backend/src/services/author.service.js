const { Author } = require('../models/reference');
const Resource = require('../models/Resource');
const ApiError = require('../utils/ApiError');
const auditService = require('./audit.service');
const { buildPagination, paginate, like, compact, escapeRegex } = require('../utils/query');

async function list(query = {}) {
  const pagination = buildPagination(query, { defaultSort: 'lastName', defaultLimit: 50 });
  const filter = compact({ nationality: query.nationality });
  if (query.isActive !== undefined) filter.isActive = query.isActive === true || query.isActive === 'true';
  if (query.search) {
    filter.$or = [
      { firstName: like(query.search) },
      { lastName: like(query.search) },
      { fullName: like(query.search) },
      { affiliation: like(query.search) },
    ];
  }
  return paginate(Author, filter, pagination);
}

async function getById(id) {
  const author = await Author.findById(id);
  if (!author) throw ApiError.notFound('Author not found');
  return author;
}

/** An author plus the catalogue titles attributed to them. */
async function getWithResources(id, query = {}) {
  const author = await getById(id);
  const pagination = buildPagination(query, { defaultSort: '-publicationYear', defaultLimit: 20 });
  const resources = await paginate(Resource, { authors: author._id }, pagination, {
    select: 'title resourceType publicationYear status totalCopies availableCopies coverImage',
    populate: { path: 'publisher', select: 'name' },
  });
  return { author, resources };
}

async function create(payload, actor, context = {}) {
  const author = await Author.create({ ...payload, createdBy: actor?._id, updatedBy: actor?._id });
  await auditService.record({
    ...context, actor, action: 'reference_created', entityType: 'Author', entityId: author._id,
    entityLabel: author.fullName, newValue: author.toObject(),
  });
  return author;
}

/**
 * Resolves typed author names to Author ids, registering any author not seen
 * before. Matching is on the full name, ignoring case, so "thomas cormen" and
 * "Thomas Cormen" are the same person. Authors are only ever registered this
 * way, while cataloguing a title.
 */
async function findOrCreateByNames(names = [], actor, context = {}) {
  const seen = new Set();
  const ids = [];
  for (const raw of names) {
    const name = String(raw || '').replace(/\s+/g, ' ').trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());

    // eslint-disable-next-line no-await-in-loop
    let author = await Author.findOne({ fullName: new RegExp(`^${escapeRegex(name)}$`, 'i') });
    if (!author) {
      const parts = name.split(' ');
      const lastName = parts.length > 1 ? parts.pop() : parts[0];
      // eslint-disable-next-line no-await-in-loop
      author = await create({ firstName: parts.join(' ') || lastName, lastName }, actor, context);
    }
    ids.push(author._id);
  }
  return ids;
}

module.exports = { list, getById, getWithResources, findOrCreateByNames };
