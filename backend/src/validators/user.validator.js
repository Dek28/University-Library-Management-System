const {
  z, objectId, optionalObjectId, paginationQuery, dateRangeQuery,
  password, email, booleanish,
} = require('./common.validator');
const { USER_STATUS, GENDERS } = require('../constants/enums');

const nameField = z.string().trim().min(1).max(60);

const baseUserFields = {
  firstName: nameField,
  middleName: z.string().trim().max(60).optional().default(''),
  lastName: nameField,
  email,
  phone: z.string().trim().max(30).optional().default(''),
  address: z.string().trim().max(200).optional().default(''),
  gender: z.enum(GENDERS).optional().default('undisclosed'),
  dateOfBirth: z.coerce.date().optional().nullable(),
  registrationNumber: z.string().trim().max(40).optional(),
  employeeId: z.string().trim().max(40).optional(),
  barcode: z.string().trim().max(40).optional(),
  faculty: optionalObjectId,
  department: optionalObjectId,
  program: optionalObjectId,
  academicYear: z.string().trim().max(20).optional().default(''),
  yearOfStudy: z.coerce.number().int().min(1).max(10).optional().nullable(),
  semester: z.coerce.number().int().min(1).max(3).optional().nullable(),
  graduationYear: z.coerce.number().int().min(1900).max(2200).optional().nullable(),
  notes: z.string().trim().max(500).optional().default(''),
};

const createUserSchema = z.object({
  ...baseUserFields,
  // Accepts either a role id or a role key such as "student".
  role: z.string().min(2),
  password,
  mustChangePassword: z.boolean().optional().default(true),
  status: z.enum(USER_STATUS).optional().default('active'),
}).refine(
  (data) => Boolean(data.registrationNumber || data.employeeId),
  { message: 'Either a registration number or a staff ID is required', path: ['registrationNumber'] },
);

const updateUserSchema = z.object({
  ...Object.fromEntries(Object.entries(baseUserFields).map(([k, v]) => [k, v.optional()])),
  role: z.string().min(2).optional(),
}).strict();

const changeStatusSchema = z.object({
  status: z.enum(USER_STATUS),
  reason: z.string().trim().max(300).optional().default(''),
});

const adminResetPasswordSchema = z.object({ newPassword: password });

const listUsersQuery = paginationQuery.merge(dateRangeQuery).extend({
  status: z.enum(USER_STATUS).optional(),
  role: objectId.optional(),
  roleKey: z.string().optional(),
  department: objectId.optional(),
  faculty: objectId.optional(),
  program: objectId.optional(),
  academicYear: z.string().optional(),
  gender: z.enum(GENDERS).optional(),
  hasOutstandingFines: booleanish.optional(),
  hasActiveLoans: booleanish.optional(),
  format: z.enum(['json', 'xlsx', 'csv', 'pdf']).optional().default('json'),
});

const importQuery = z.object({
  roleKey: z.string().optional().default('student'),
  defaultPassword: password,
  dryRun: booleanish.optional(),
});

const lookupQuery = z.object({ identifier: z.string().trim().min(2) });

module.exports = {
  createUserSchema, updateUserSchema, changeStatusSchema, adminResetPasswordSchema,
  listUsersQuery, importQuery, lookupQuery,
};
