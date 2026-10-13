const { z, objectId, optionalObjectId, paginationQuery, yearField } = require('./common.validator');
const { RESOURCE_TYPES, ACCESS_LEVELS } = require('../constants/enums');

/**
 * Upload fields arrive as multipart form values, so arrays may be sent as a
 * JSON string or a comma-separated list. This coerces both into a string array.
 */
const stringArray = z.preprocess((value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || value.trim() === '') return [];
  const trimmed = value.trim();
  if (trimmed.startsWith('[')) {
    try { return JSON.parse(trimmed); } catch { /* fall through to CSV */ }
  }
  return trimmed.split(',').map((v) => v.trim()).filter(Boolean);
}, z.array(z.string().trim().max(120)).max(30));

const uploadSchema = z.object({
  title: z.string().trim().min(1).max(300),
  authorNames: stringArray.optional().default([]),
  supervisor: z.string().trim().max(160).optional().default(''),
  resourceType: z.enum(RESOURCE_TYPES),
  year: yearField.optional(),
  faculty: optionalObjectId,
  department: optionalObjectId,
  language: optionalObjectId,
  abstract: z.string().trim().max(8000).optional().default(''),
  keywords: stringArray.optional().default([]),
  accessLevel: z.enum(ACCESS_LEVELS).optional().default('university'),
  allowedRoles: stringArray.optional().default([]),
  isDownloadable: z.preprocess((v) => (v === 'false' ? false : v === 'true' ? true : v), z.boolean()).optional().default(true),
  isPublished: z.preprocess((v) => (v === 'false' ? false : v === 'true' ? true : v), z.boolean()).optional().default(true),
  externalUrl: z.string().trim().max(500).optional().default(''),
  resource: optionalObjectId,
});

const updateSchema = uploadSchema.partial();

const listQuery = paginationQuery.extend({
  resourceType: z.enum(RESOURCE_TYPES).optional(),
  accessLevel: z.enum(ACCESS_LEVELS).optional(),
  department: objectId.optional(),
  faculty: objectId.optional(),
  year: yearField.optional(),
  yearFrom: yearField.optional(),
  yearTo: yearField.optional(),
});

const downloadQuery = z.object({ inline: z.enum(['true', 'false']).optional() });

module.exports = { uploadSchema, updateSchema, listQuery, downloadQuery };
