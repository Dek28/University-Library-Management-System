const MAX_LIMIT = 200;

/**
 * Row ceiling for a full export.
 *
 * Exports lift the interactive page cap, because a spreadsheet silently cut to
 * one page is worse than no spreadsheet at all, but they stay bounded so a
 * single request can never pull an unbounded result set into memory.
 */
const EXPORT_MAX_ROWS = 10000;

/** Query overrides that ask a list service for the whole result set. */
const EXPORT_PAGE = { page: 1, limit: EXPORT_MAX_ROWS };

/** Pagination options that let that request through the cap. */
const EXPORT_OPTIONS = { maxLimit: EXPORT_MAX_ROWS };

/**
 * Normalises `page`, `limit`, `sort` and `order` query params.
 *
 * `maxLimit` is deliberately an *option*, never read from `query`: only server
 * code (an export handler) may raise the ceiling, never a caller.
 */
function buildPagination(query = {}, { defaultLimit = 20, defaultSort = '-createdAt', maxLimit = MAX_LIMIT } = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const rawLimit = Number.parseInt(query.limit, 10) || defaultLimit;
  const limit = Math.min(Math.max(1, rawLimit), maxLimit);

  let sort = defaultSort;
  if (query.sort) {
    const raw = String(query.sort);
    const field = raw.replace(/^[-+]/, '');
    // Guard against operator injection through the sort key.
    if (/^[a-zA-Z0-9_.]+$/.test(field)) {
      const order = String(query.order || '').toLowerCase();
      const descending = order ? order === 'desc' : raw.startsWith('-');
      sort = `${descending ? '-' : ''}${field}`;
    }
  }

  return { page, limit, skip: (page - 1) * limit, sort };
}

/** Escapes a user supplied string for safe use inside a RegExp. */
const escapeRegex = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Case-insensitive "contains" matcher. */
const like = (value) => new RegExp(escapeRegex(value), 'i');

/** Builds an $or matcher across the given fields for a free-text term. */
const orLike = (term, fields) => ({ $or: fields.map((f) => ({ [f]: like(term) })) });

/** Removes undefined/empty values so filters stay clean. */
function compact(obj) {
  return Object.entries(obj).reduce((acc, [key, value]) => {
    if (value === undefined || value === null || value === '') return acc;
    acc[key] = value;
    return acc;
  }, {});
}

/** Parses a from/to date range into a Mongo range object. */
function dateRange(from, to) {
  const range = {};
  if (from) {
    const d = new Date(from);
    if (!Number.isNaN(d.valueOf())) range.$gte = d;
  }
  if (to) {
    const d = new Date(to);
    if (!Number.isNaN(d.valueOf())) {
      d.setHours(23, 59, 59, 999);
      range.$lte = d;
    }
  }
  return Object.keys(range).length ? range : undefined;
}

const SENSITIVE_FIELDS = ['password', 'tokenHash', 'passwordResetTokenHash', 'storageKey'];

/**
 * `lean()` skips the toJSON transform, so lean documents would otherwise
 * expose `_id`/`__v` while document endpoints return `id`. This normalises
 * lean results (including populated sub-documents) to the same wire shape.
 */
function normalizeLean(value, depth = 0) {
  // Documents nest at most a handful of levels; the guard stops a cycle in
  // unexpected input from taking the process down.
  if (depth > 12) return value;
  if (Array.isArray(value)) return value.map((v) => normalizeLean(v, depth + 1));
  if (!value || typeof value !== 'object') return value;
  if (value instanceof Date) return value;
  // ObjectId and other BSON values serialise as strings.
  if (value._bsontype) return String(value);

  // A Mongoose document (or sub-document) carries internals that must never be
  // walked directly. Run its own transform first, then normalise the result.
  if (typeof value.toJSON === 'function' && value.constructor?.name !== 'Object') {
    return normalizeLean(value.toJSON(), depth + 1);
  }

  const out = {};
  for (const [key, raw] of Object.entries(value)) {
    if (key === '__v' || SENSITIVE_FIELDS.includes(key)) continue;
    if (key === '_id') {
      out.id = String(raw);
      continue;
    }
    out[key] = normalizeLean(raw, depth + 1);
  }
  return out;
}

/** Runs a paginated find + count against a model. */
async function paginate(Model, filter, { page, limit, skip, sort }, { select, populate, lean = true } = {}) {
  let q = Model.find(filter).sort(sort).skip(skip).limit(limit);
  if (select) q = q.select(select);
  if (populate) [].concat(populate).forEach((p) => { q = q.populate(p); });
  if (lean) q = q.lean();
  const [items, total] = await Promise.all([q.exec(), Model.countDocuments(filter)]);
  return { items: lean ? normalizeLean(items) : items, total, page, limit };
}

module.exports = {
  buildPagination, escapeRegex, like, orLike, compact, dateRange,
  paginate, normalizeLean, MAX_LIMIT, EXPORT_MAX_ROWS, EXPORT_PAGE, EXPORT_OPTIONS,
};
