const express = require('express');
const controller = require('../../controllers/admin.controller');
const validate = require('../../middleware/validate');
const { authenticate, requirePermission } = require('../../middleware/auth');
const { imageUpload } = require('../../middleware/upload');
const { uploadLimiter } = require('../../middleware/security');
const { idParam, objectId, paginationQuery, dateRangeQuery, z } = require('../../validators/common.validator');
const { P } = require('../../constants/permissions');
const env = require('../../config/env');
const { escapeRegex } = require('../../utils/query');

// Only a logo this application stored can be named, so the value can never
// point at some other file when it is read back for a PDF.
const LOGO_URL = new RegExp(`^${escapeRegex(env.storage.publicBaseUrl)}/logos/[A-Za-z0-9._-]+$`);

const settingsRouter = express.Router();
const rolesRouter = express.Router();
const auditRouter = express.Router();

// Settings

const settingsSchema = z.object({
  institution: z.object({
    universityName: z.string().trim().max(160).optional(),
    libraryName: z.string().trim().max(160).optional(),
    logoUrl: z.string().max(500).regex(LOGO_URL, 'Not an uploaded logo').nullable().optional(),
    email: z.string().max(160).optional(),
    phone: z.string().max(40).optional(),
    address: z.string().max(300).optional(),
    website: z.string().max(200).optional(),
  }).optional(),
  academic: z.object({
    currentAcademicYear: z.string().max(20).optional(),
    currentSemester: z.coerce.number().int().min(1).max(3).optional(),
  }).optional(),
  locale: z.object({
    currency: z.string().max(10).optional(),
    currencySymbol: z.string().max(5).optional(),
    timezone: z.string().max(60).optional(),
    dateFormat: z.string().max(20).optional(),
  }).optional(),
  borrowingRules: z.array(z.object({
    roleKey: z.string().min(2).max(40),
    maxBooks: z.coerce.number().int().min(0).max(100),
    loanPeriodDays: z.coerce.number().int().min(1).max(365),
    maxRenewals: z.coerce.number().int().min(0).max(20),
    renewalPeriodDays: z.coerce.number().int().min(1).max(365).optional(),
    blockingFineThreshold: z.coerce.number().min(0).optional(),
    allowedResourceTypes: z.array(z.string()).optional(),
  })).optional(),
  finePolicies: z.array(z.object({
    resourceType: z.string().max(40),
    overdueRatePerDay: z.coerce.number().min(0),
    gracePeriodDays: z.coerce.number().int().min(0).max(60),
    maxFineAmount: z.coerce.number().min(0),
    lostItemBaseFine: z.coerce.number().min(0),
    damagedItemFine: z.coerce.number().min(0),
    severelyDamagedFine: z.coerce.number().min(0),
    replacementMultiplier: z.coerce.number().min(0).max(10),
  })).optional(),
  circulation: z.object({
    finesEnabled: z.boolean().optional(),
    reservationExpiryDays: z.coerce.number().int().min(1).max(30).optional(),
    dueSoonReminderDays: z.coerce.number().int().min(1).max(30).optional(),
    blockBorrowingWhenOverdue: z.boolean().optional(),
    blockRenewalWhenReserved: z.boolean().optional(),
    allowSelfRenewal: z.boolean().optional(),
  }).optional(),
  operatingHours: z.array(z.object({
    day: z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']),
    opensAt: z.string().max(5),
    closesAt: z.string().max(5),
    isClosed: z.boolean().optional(),
  })).optional(),
  uploads: z.object({
    maxFileSizeMb: z.coerce.number().int().min(1).max(200).optional(),
    allowedDocumentTypes: z.array(z.string()).optional(),
    allowedImageTypes: z.array(z.string()).optional(),
  }).optional(),
  security: z.object({
    passwordMinLength: z.coerce.number().int().min(8).max(64).optional(),
    passwordExpiryDays: z.coerce.number().int().min(0).max(3650).optional(),
    maxFailedLogins: z.coerce.number().int().min(1).max(20).optional(),
  }).optional(),
}).strict();

// Unauthenticated: branding for the sign-in screen.
settingsRouter.get('/public', controller.getPublicSettings);

settingsRouter.use(authenticate);
settingsRouter.get('/', requirePermission(P.SETTING_VIEW), controller.getSettings);
settingsRouter.patch('/', requirePermission(P.SETTING_MANAGE), validate({ body: settingsSchema }), controller.updateSettings);
settingsRouter.post('/logo', requirePermission(P.SETTING_MANAGE), uploadLimiter, imageUpload.single('logo'), controller.uploadLogo);

// Roles

const roleSchema = z.object({
  key: z.string().trim().min(2).max(40).regex(/^[a-z_]+$/, 'Use lowercase letters and underscores'),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).optional().default(''),
  level: z.coerce.number().int().min(0).max(99),
  permissions: z.array(z.string()).max(200).optional().default([]),
  isActive: z.boolean().optional(),
});

rolesRouter.use(authenticate);
rolesRouter.get('/', requirePermission(P.ROLE_VIEW), controller.listRoles);
rolesRouter.get('/permissions', requirePermission(P.ROLE_VIEW), controller.getPermissionCatalogue);
rolesRouter.post('/', requirePermission(P.ROLE_MANAGE), validate({ body: roleSchema }), controller.createRole);
rolesRouter.patch(
  '/:id',
  requirePermission(P.ROLE_MANAGE),
  validate({ params: idParam(), body: roleSchema.partial() }),
  controller.updateRole,
);

// Audit logs

const auditQuery = paginationQuery.merge(dateRangeQuery).extend({
  action: z.string().max(60).optional(),
  entityType: z.string().max(60).optional(),
  entityId: objectId.optional(),
  user: objectId.optional(),
  status: z.enum(['success', 'failure']).optional(),
});

auditRouter.use(authenticate, requirePermission(P.AUDIT_VIEW));
auditRouter.get('/', validate({ query: auditQuery }), controller.listAuditLogs);

module.exports = { settingsRouter, rolesRouter, auditRouter };
