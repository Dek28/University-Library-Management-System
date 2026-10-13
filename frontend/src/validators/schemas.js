import { z } from 'zod';

/**
 * Client-side schemas mirroring the API's rules.
 * These exist to give immediate feedback. The server validates every write
 * again regardless of what passes here.
 */

export const passwordSchema = z.string()
  .min(8, 'Use at least 8 characters')
  .max(128)
  .regex(/[a-z]/, 'Include a lowercase letter')
  .regex(/[A-Z]/, 'Include an uppercase letter')
  .regex(/\d/, 'Include a number');

export const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Select a valid option');
const optionalId = z.union([objectId, z.literal('')]).optional();
const optionalText = (max) => z.string().trim().max(max).optional().or(z.literal(''));

export const userSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required').max(60),
  middleName: optionalText(60),
  lastName: z.string().trim().min(1, 'Last name is required').max(60),
  email: z.string().trim().email('Enter a valid email address'),
  phone: optionalText(30),
  address: optionalText(200),
  gender: z.enum(['male', 'female', 'other', 'undisclosed']).optional(),
  registrationNumber: optionalText(40),
  employeeId: optionalText(40),
  role: z.string().min(2, 'Select a role'),
  faculty: optionalId,
  department: optionalId,
  program: optionalId,
  academicYear: optionalText(20),
  yearOfStudy: z.coerce.number().int().min(1).max(10).optional().or(z.literal('')),
  semester: z.coerce.number().int().min(1).max(3).optional().or(z.literal('')),
  graduationYear: z.coerce.number().int().min(1900).max(2200).optional().or(z.literal('')),
  notes: optionalText(500),
}).refine((data) => Boolean(data.registrationNumber || data.employeeId), {
  message: 'Provide a registration number or a staff ID',
  path: ['registrationNumber'],
});

export const createUserSchema = userSchema.and(z.object({ password: passwordSchema }));

export const resourceSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(300),
  subtitle: optionalText(300),
  resourceType: z.string().min(1, 'Select a resource type'),
  isbn: optionalText(20),
  publisher: optionalId,
  publicationYear: z.union([
    z.literal(''),
    z.string().trim()
      .regex(/^\d{4}$/, 'Publication year must be a 4-digit year')
      .pipe(z.coerce.number().int()
        .min(1400, 'Enter a realistic year')
        .max(new Date().getFullYear() + 5, 'Publication year cannot be that far in the future')),
  ]).optional(),
  edition: optionalText(40),
  volume: optionalText(40),
  language: optionalId,
  pages: z.coerce.number().int().min(0).max(100000).optional().or(z.literal('')),
  category: optionalId,
  subjects: z.array(objectId).optional(),
  department: optionalId,
  faculty: optionalId,
  keywords: z.array(z.string()).optional(),
  description: optionalText(5000),
  acquisitionSource: z.string().optional(),
  supplier: optionalText(160),
  purchasePrice: z.coerce.number().min(0, 'Price cannot be negative').optional().or(z.literal('')),
  replacementCost: z.coerce.number().min(0, 'Cost cannot be negative').optional().or(z.literal('')),
  isBorrowable: z.boolean().optional(),
  isReferenceOnly: z.boolean().optional(),
});

export const copySchema = z.object({
  resource: objectId,
  accessionNumber: optionalText(40),
  barcode: optionalText(40),
  shelf: optionalId,
  section: optionalText(60),
  rack: optionalText(60),
  condition: z.string().optional(),
  price: z.coerce.number().min(0).optional().or(z.literal('')),
  replacementCost: z.coerce.number().min(0).optional().or(z.literal('')),
  notes: optionalText(500),
});

export const batchCopySchema = copySchema.omit({ accessionNumber: true, barcode: true }).and(
  z.object({ quantity: z.coerce.number().int().min(1, 'At least one copy').max(100, 'At most 100 at a time') }),
);

export const issueSchema = z.object({
  userIdentifier: z.string().trim().min(2, 'Scan or enter a member ID'),
  copyIdentifier: z.string().trim().min(1, 'Scan or enter a copy barcode'),
  dueDate: z.string().optional().or(z.literal('')),
  notes: optionalText(500),
});

export const returnSchema = z.object({
  copyIdentifier: z.string().trim().min(1, 'Scan or enter a copy barcode'),
  condition: z.string().min(1),
  notes: optionalText(500),
});

export const paymentSchema = z.object({
  amount: z.coerce.number().positive('Enter an amount greater than zero'),
  method: z.string().optional(),
  reference: optionalText(80),
  notes: optionalText(300),
});

export const waiveSchema = z.object({
  amount: z.coerce.number().min(0).optional().or(z.literal('')),
  reason: z.string().trim().min(5, 'Give a reason of at least 5 characters').max(300),
});

export const manualFineSchema = z.object({
  user: objectId,
  fineType: z.string().min(1, 'Select a fine type'),
  amount: z.coerce.number().positive('Enter an amount greater than zero'),
  reason: z.string().trim().min(3, 'Give a reason').max(300),
});

export const groupSchema = z.object({
  name: z.string().trim().min(2, 'Group name is required').max(120),
  readingTopic: optionalText(200),
  description: optionalText(1000),
  leader: optionalId,
  members: z.array(objectId).optional(),
  department: optionalId,
  faculty: optionalId,
  program: optionalId,
  academicYear: optionalText(20),
  status: z.string().optional(),
  maxMembers: z.coerce.number().int().min(2).max(100).optional().or(z.literal('')),
});

export const sessionSchema = z.object({
  group: objectId,
  topic: optionalText(200),
  sessionDate: z.string().min(1, 'Choose a date'),
  startTime: z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/, 'Use HH:mm'),
  endTime: z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/, 'Use HH:mm'),
  space: objectId,
  expectedAttendees: z.coerce.number().int().min(0).max(200).optional().or(z.literal('')),
  notes: optionalText(1000),
}).refine((data) => data.endTime > data.startTime, {
  message: 'The end time must be after the start time',
  path: ['endTime'],
});

export const digitalSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(300),
  resourceType: z.string().min(1, 'Select a type'),
  authorNames: optionalText(500),
  supervisor: optionalText(160),
  year: z.coerce.number().int().min(1400).max(new Date().getFullYear() + 5).optional().or(z.literal('')),
  faculty: optionalId,
  department: optionalId,
  abstract: optionalText(8000),
  keywords: optionalText(500),
  accessLevel: z.string().min(1),
  isDownloadable: z.boolean().optional(),
  isPublished: z.boolean().optional(),
});

/**
 * Form schema for a reference collection. Only faculties, departments and
 * programs have a code; a shelf is defined by section + rack instead of a name.
 */
export const referenceSchemaFor = ({ hasCode = false, isShelf = false, noDescription = false } = {}) => z.object({
  isActive: z.boolean().optional(),
  ...(hasCode && { code: z.string().trim().min(1, 'Code is required').max(20) }),
  ...(isShelf
    ? {
      section: z.string().trim().min(1, 'Section name is required').max(60),
      rack: z.string().trim().min(1, 'Rack number is required').max(60),
    }
    : { name: z.string().trim().min(1, 'Name is required').max(120) }),
  ...(!isShelf && !noDescription && { description: optionalText(500) }),
}).passthrough();

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password'),
  newPassword: passwordSchema,
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'The two passwords do not match',
  path: ['confirmPassword'],
});
