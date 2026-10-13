const { z, objectId, paginationQuery, dateRangeQuery, booleanish, money } = require('./common.validator');
const { LOAN_STATUS, COPY_CONDITION, RESERVATION_STATUS, FINE_TYPES, FINE_STATUS } = require('../constants/enums');

const issueSchema = z.object({
  // Accepts a scanned card barcode, registration/staff number or email.
  userIdentifier: z.string().trim().min(2),
  // Accepts a scanned copy barcode or an accession number.
  copyIdentifier: z.string().trim().min(1),
  dueDate: z.coerce.date().optional(),
  notes: z.string().trim().max(500).optional().default(''),
});

const returnSchema = z.object({
  copyIdentifier: z.string().trim().min(1).optional(),
  loanId: objectId.optional(),
  condition: z.enum(COPY_CONDITION).optional().default('good'),
  notes: z.string().trim().max(500).optional().default(''),
}).refine((d) => d.copyIdentifier || d.loanId, {
  message: 'Provide either a copy barcode or a loan id',
  path: ['copyIdentifier'],
});

const renewSchema = z.object({
  notes: z.string().trim().max(500).optional().default(''),
  channel: z.enum(['desk', 'self_service']).optional(),
});

const markLostSchema = z.object({
  reason: z.string().trim().min(3, 'A reason is required').max(500),
});

const eligibilityQuery = z.object({
  userIdentifier: z.string().trim().min(2).optional(),
  userId: objectId.optional(),
  resourceId: objectId.optional(),
}).refine((d) => d.userIdentifier || d.userId, {
  message: 'Provide a member id or identifier',
  path: ['userIdentifier'],
});

const loanListQuery = paginationQuery.merge(dateRangeQuery).extend({
  user: objectId.optional(),
  resource: objectId.optional(),
  copy: objectId.optional(),
  issuedBy: objectId.optional(),
  status: z.enum(LOAN_STATUS).optional(),
  openOnly: booleanish.optional(),
  overdueOnly: booleanish.optional(),
  dueSoonDays: z.coerce.number().int().min(1).max(60).optional(),
  returnedFrom: z.string().optional(),
  returnedTo: z.string().optional(),
  format: z.enum(['json', 'xlsx', 'csv', 'pdf']).optional().default('json'),
});

const reservationCreateSchema = z.object({
  resource: objectId,
  // Librarians may place a hold on a member's behalf; members may not name
  // anyone but themselves (enforced in the controller).
  user: objectId.optional(),
  notes: z.string().trim().max(300).optional().default(''),
});

const reservationCancelSchema = z.object({
  reason: z.string().trim().max(300).optional().default(''),
});

const reservationListQuery = paginationQuery.extend({
  user: objectId.optional(),
  resource: objectId.optional(),
  status: z.enum(RESERVATION_STATUS).optional(),
  activeOnly: booleanish.optional(),
});

const fineListQuery = paginationQuery.merge(dateRangeQuery).extend({
  user: objectId.optional(),
  fineType: z.enum(FINE_TYPES).optional(),
  status: z.enum(FINE_STATUS).optional(),
  outstandingOnly: booleanish.optional(),
  format: z.enum(['json', 'xlsx', 'csv', 'pdf']).optional().default('json'),
});

const paymentSchema = z.object({
  amount: money.refine((v) => v > 0, 'Payment must be greater than zero'),
  method: z.enum(['cash', 'bank', 'mobile_money', 'card', 'internal']).optional(),
  reference: z.string().trim().max(80).optional().default(''),
  notes: z.string().trim().max(300).optional().default(''),
});

const waiveSchema = z.object({
  amount: money.optional(),
  reason: z.string().trim().min(5, 'A reason of at least 5 characters is required').max(300),
});

const manualFineSchema = z.object({
  user: objectId,
  loan: objectId.optional(),
  resource: objectId.optional(),
  copy: objectId.optional(),
  fineType: z.enum(FINE_TYPES),
  amount: money.refine((v) => v > 0, 'Amount must be greater than zero'),
  reason: z.string().trim().min(3).max(300),
});

const cancelFineSchema = z.object({ reason: z.string().trim().min(3).max(300) });

module.exports = {
  issueSchema, returnSchema, renewSchema, markLostSchema, eligibilityQuery, loanListQuery,
  reservationCreateSchema, reservationCancelSchema, reservationListQuery,
  fineListQuery, paymentSchema, waiveSchema, manualFineSchema, cancelFineSchema,
};
