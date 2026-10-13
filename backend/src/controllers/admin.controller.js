/** Settings, roles/permissions and audit-log endpoints. */
const catchAsync = require('../utils/catchAsync');
const { ok, paginated } = require('../utils/response');
const ApiError = require('../utils/ApiError');
const Role = require('../models/Role');
const settingsService = require('../services/settings.service');
const auditService = require('../services/audit.service');
const storage = require('../services/storage');
const { invalidateRoleCache } = require('../middleware/auth');
const { ALL_PERMISSIONS, ROLE_KEYS } = require('../constants/permissions');

// ------------------------------------------------------------------- Settings

const getSettings = catchAsync(async (req, res) =>
  ok(res, { message: 'System settings', data: await settingsService.getSettings({ fresh: true }) }));

/** Public subset used by the sign-in screen before authentication. */
const getPublicSettings = catchAsync(async (req, res) => {
  const settings = await settingsService.getSettings();
  return ok(res, {
    message: 'Public settings',
    data: {
      institution: {
        universityName: settings.institution.universityName,
        libraryName: settings.institution.libraryName,
        logoUrl: settings.institution.logoUrl,
        email: settings.institution.email,
        phone: settings.institution.phone,
        website: settings.institution.website,
      },
      locale: settings.locale,
      operatingHours: settings.operatingHours,
      // Members' screens hide fines when the library doesn't charge them.
      circulation: { finesEnabled: settings.circulation?.finesEnabled !== false },
    },
  });
});

const updateSettings = catchAsync(async (req, res) => {
  const { before, after } = await settingsService.updateSettings(req.body, req.user._id);
  await auditService.record({
    req, actor: req.user, action: 'settings_updated', entityType: 'SystemSetting',
    entityId: after._id, oldValue: before, newValue: after,
  });
  return ok(res, { message: 'Settings updated successfully', data: after });
});

const uploadLogo = catchAsync(async (req, res) => {
  if (!req.file) throw ApiError.badRequest('An image file is required');
  const extension = (req.file.originalname.match(/\.[a-z0-9]+$/i) || ['.png'])[0].toLowerCase();
  const saved = await storage.save(req.file.buffer, { key: `logos/institution${extension}` });
  const logoUrl = storage.publicUrl(saved.key);

  const { after } = await settingsService.updateSettings({ institution: { ...(await settingsService.getSettings()).institution, logoUrl } }, req.user._id);
  await auditService.record({
    req, actor: req.user, action: 'settings_updated', entityType: 'SystemSetting',
    description: 'Institution logo updated',
  });
  return ok(res, { message: 'Logo updated', data: { logoUrl, settings: after } });
});

// ---------------------------------------------------------------------- Roles

const listRoles = catchAsync(async (req, res) => {
  const roles = await Role.find().sort('-level').lean();
  return ok(res, { message: 'Roles', data: roles });
});

const getPermissionCatalogue = catchAsync(async (req, res) => {
  // Grouped by domain so the UI can render one section per domain.
  const grouped = ALL_PERMISSIONS.reduce((acc, permission) => {
    const [domain] = permission.split(':');
    (acc[domain] = acc[domain] || []).push(permission);
    return acc;
  }, {});
  return ok(res, { message: 'Permission catalogue', data: { permissions: ALL_PERMISSIONS, grouped } });
});

const updateRole = catchAsync(async (req, res) => {
  const role = await Role.findById(req.params.id);
  if (!role) throw ApiError.notFound('Role not found');
  if (role.key === ROLE_KEYS.SUPER_ADMIN) {
    throw ApiError.forbidden('The super administrator role cannot be modified');
  }

  const actorRole = await Role.findById(req.user.role).lean();
  if (actorRole.key !== ROLE_KEYS.SUPER_ADMIN && role.level >= actorRole.level) {
    throw ApiError.forbidden('You cannot modify a role at or above your own authority level');
  }

  const before = role.toObject();
  const { key, isSystem, ...safe } = req.body;
  if (safe.permissions) {
    const unknown = safe.permissions.filter((p) => !ALL_PERMISSIONS.includes(p));
    if (unknown.length) throw ApiError.badRequest(`Unknown permission(s): ${unknown.join(', ')}`);
  }
  role.set(safe);
  await role.save();
  invalidateRoleCache();

  await auditService.record({
    req, actor: req.user, action: 'role_updated', entityType: 'Role', entityId: role._id,
    entityLabel: role.name, oldValue: before, newValue: role.toObject(),
  });
  return ok(res, { message: 'Role updated successfully', data: role });
});

const createRole = catchAsync(async (req, res) => {
  const actorRole = await Role.findById(req.user.role).lean();
  if (req.body.level >= actorRole.level && actorRole.key !== ROLE_KEYS.SUPER_ADMIN) {
    throw ApiError.forbidden('You cannot create a role at or above your own authority level');
  }
  const unknown = (req.body.permissions || []).filter((p) => !ALL_PERMISSIONS.includes(p));
  if (unknown.length) throw ApiError.badRequest(`Unknown permission(s): ${unknown.join(', ')}`);

  const role = await Role.create({ ...req.body, isSystem: false });
  invalidateRoleCache();
  await auditService.record({
    req, actor: req.user, action: 'role_updated', entityType: 'Role', entityId: role._id,
    entityLabel: role.name, newValue: role.toObject(), description: 'Role created',
  });
  return ok(res, { status: 201, message: 'Role created successfully', data: role });
});

// ----------------------------------------------------------------- Audit logs

const listAuditLogs = catchAsync(async (req, res) => {
  const result = await auditService.list(req.query);
  return paginated(res, { items: result.items, page: result.page, limit: result.limit, total: result.total });
});

module.exports = {
  getSettings, getPublicSettings, updateSettings, uploadLogo,
  listRoles, getPermissionCatalogue, createRole, updateRole, listAuditLogs,
};
