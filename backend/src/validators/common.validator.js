const { z } = require('zod');

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Must be a valid id');

const optionalObjectId = z.union([objectId, z.literal(''), z.null()])
  .optional()
  .transform((v) => (v === '' || v === null ? null : v));

const idParam = (name = 'id') => z.object({ [name]: objectId });

/** Coerces "true"/"false" query strings into booleans. */
const booleanish = z.union([z.boolean(), z.enum(['true', 'false'])])
  .transform((v) => v === true || v === 'true');

const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  sort: z.string().max(60).optional(),
  order: z.enum(['asc', 'desc']).optional(),
  search: z.string().trim().max(200).optional(),
});

const dateRangeQuery = z.object({
  from: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  to: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
});

const password = z.string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/\d/, 'Password must contain a number')
  // bcrypt reads only the first 72 bytes, so a longer password would be silently truncated.
  .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'Password must be at most 72 bytes long');

const email = z.string().trim().toLowerCase().email('A valid email address is required');

const phone = z.string().trim().max(30).optional().default('');

const money = z.coerce.number().min(0, 'Amount cannot be negative');

// Accepts 2009 or "2009"; rejects text, decimals and negative numbers.
const yearField = z
  .union([z.number(), z.string().trim().regex(/^\d{4}$/, 'Year must be a 4-digit number')])
  .pipe(z.coerce.number().int('Year must be a whole number')
    .min(1400, 'Year must be 1400 or later')
    .max(new Date().getFullYear() + 5, 'Year cannot be that far in the future'));

const timeString = z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/, 'Time must be in HH:mm format');

module.exports = {
  z, objectId, optionalObjectId, idParam, booleanish,
  paginationQuery, dateRangeQuery, password, email, phone, money, yearField, timeString,
};
