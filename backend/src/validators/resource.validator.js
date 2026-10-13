const {
  z,
  objectId,
  optionalObjectId,
  paginationQuery,
  yearField,
  money,
  booleanish,
} = require('./common.validator');

const {
  RESOURCE_TYPES,
  RESOURCE_STATUS,
  COPY_STATUS,
  COPY_CONDITION,
} = require('../constants/enums');

const resourceBody = z.object({
  title: z.string().trim().min(1).max(300),

  subtitle: z.string().trim().max(300).optional().default(''),

  isbn: z.string().trim().max(20).optional(),

  doi: z.string().trim().max(120).optional().default(''),

  // CHANGED: shelf (location) where the book is kept. New copies inherit it.
  shelf: optionalObjectId,

  resourceType: z.enum(RESOURCE_TYPES),

  authors: z.array(objectId).max(20).optional(),

  // Typed author names; unknown authors are registered when the title is saved.
  authorNames: z.array(z.string().trim().min(1).max(120)).max(20).optional(),

  editors: z.array(z.string().trim().max(120)).max(20).optional().default([]),

  publisher: optionalObjectId,

  publicationYear: yearField.optional(),

  edition: z.string().trim().max(40).optional().default(''),

  volume: z.string().trim().max(40).optional().default(''),

  language: optionalObjectId,

  pages: z.coerce.number().int().min(0).max(100000).optional().nullable(),

  category: optionalObjectId,

  subjects: z.array(objectId).max(20).optional().default([]),

  department: optionalObjectId,

  faculty: optionalObjectId,

  keywords: z.array(z.string().trim().max(60)).max(30).optional().default([]),

  description: z.string().trim().max(5000).optional().default(''),

  externalUrl: z.string().trim().max(500).optional().default(''),

  acquisitionDate: z.coerce.date().optional().nullable(),

  acquisitionSource: z
    .enum(['purchase', 'donation', 'exchange', 'legal_deposit', 'internal', 'other'])
    .optional(),

  supplier: z.string().trim().max(160).optional().default(''),

  purchasePrice: money.optional().default(0),

  replacementCost: money.optional().default(0),

  status: z.enum(RESOURCE_STATUS).optional(),

  isBorrowable: z.boolean().optional(),

  isReferenceOnly: z.boolean().optional(),
});

const resourceUpdateBody = resourceBody.partial();

const searchQuery = paginationQuery.extend({
  q: z.string().trim().max(200).optional(),

  resourceType: z.enum(RESOURCE_TYPES).optional(),

  category: objectId.optional(),

  subject: objectId.optional(),

  author: objectId.optional(),

  department: objectId.optional(),

  faculty: objectId.optional(),

  publisher: objectId.optional(),

  language: objectId.optional(),

  // CHANGED: shelf filter for the catalogue list
  shelf: objectId.optional(),

  status: z.enum(RESOURCE_STATUS).optional(),

  availability: z.enum(['available', 'unavailable']).optional(),

  isbn: z.string().trim().max(20).optional(),

  accessionNumber: z.string().trim().max(40).optional(),

  barcode: z.string().trim().max(40).optional(),

  keyword: z.string().trim().max(60).optional(),

  yearFrom: yearField.optional(),

  yearTo: yearField.optional(),

  format: z.enum(['json', 'xlsx', 'csv', 'pdf']).optional().default('json'),
});

const copyBody = z.object({
  resource: objectId,

  accessionNumber: z.string().trim().max(40).optional(),

  barcode: z.string().trim().max(40).optional(),

  shelf: optionalObjectId,

  section: z.string().trim().max(60).optional().default(''),

  rack: z.string().trim().max(60).optional().default(''),

  status: z.enum(COPY_STATUS).optional(),

  condition: z.enum(COPY_CONDITION).optional(),

  acquisitionDate: z.coerce.date().optional(),

  acquisitionSource: z.string().trim().max(60).optional(),

  price: money.optional(),

  replacementCost: money.optional(),

  notes: z.string().trim().max(500).optional().default(''),
});

const copyBatchBody = copyBody
  .extend({
    quantity: z.coerce.number().int().min(1).max(100),
  })
  .omit({
    accessionNumber: true,
    barcode: true,
  });

const copyUpdateBody = copyBody
  .partial()
  .omit({
    resource: true,
  });

const copyListQuery = paginationQuery.extend({
  resource: objectId.optional(),

  status: z.enum(COPY_STATUS).optional(),

  condition: z.enum(COPY_CONDITION).optional(),

  shelf: objectId.optional(),

  format: z.enum(['json', 'xlsx', 'csv']).optional().default('json'),
});

const suggestQuery = z.object({
  q: z.string().trim().min(2).max(80),

  limit: z.coerce.number().int().min(1).max(20).optional(),
});

const detailQuery = z.object({
  includeCopies: booleanish.optional(),
});

/**
 * Multipart fields of a bulk import. `mapping` arrives as a JSON string:
 * { "<column number>": "<catalogue field key>" }; omitted, headings are matched automatically.
 */
const importBody = z.object({
  dryRun: booleanish.optional().default(false),
  createMissing: booleanish.optional().default(false),
  mapping: z.preprocess((value) => {
    if (value === undefined || value === '') return undefined;
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch { return value; }
  }, z.record(z.string().regex(/^\d+$/), z.string().max(40).nullable()).optional()),
});

module.exports = {
  resourceBody,
  resourceUpdateBody,
  searchQuery,
  copyBody,
  copyBatchBody,
  copyUpdateBody,
  copyListQuery,
  suggestQuery,
  detailQuery,
  importBody,
};