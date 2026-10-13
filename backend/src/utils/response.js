const { normalizeLean } = require('./query');

/**
 * Produces the wire form of any payload.
 *
 * Mongoose documents go through their own `toJSON` transform first; the result
 * (and any plain/`lean()` object) is then normalised so `_id` always arrives as
 * `id` and internal fields never leak, whichever query style produced it.
 */
const serialize = (payload) => normalizeLean(payload);

/** Standard success envelope: { success, message, data, meta? } */
const ok = (res, { message = 'Success', data = null, meta, status = 200 } = {}) => {
  const body = { success: true, message, data: serialize(data) };
  if (meta) body.meta = meta;
  return res.status(status).json(body);
};

const created = (res, opts = {}) => ok(res, { status: 201, message: 'Created successfully', ...opts });

const noContent = (res) => res.status(204).send();

/** Success envelope for paginated list endpoints. */
const paginated = (res, { message = 'Success', items, page, limit, total }) =>
  res.status(200).json({
    success: true,
    message,
    data: serialize(items),
    meta: {
      page,
      limit,
      total,
      totalPages: limit > 0 ? Math.ceil(total / limit) : 0,
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1,
    },
  });

module.exports = { ok, created, noContent, paginated, serialize };
