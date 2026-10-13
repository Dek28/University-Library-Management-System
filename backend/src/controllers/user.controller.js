const catchAsync = require('../utils/catchAsync');
const { ok, created, paginated } = require('../utils/response');
const ApiError = require('../utils/ApiError');
const userService = require('../services/user.service');
const importService = require('../services/userImport.service');
const settingsService = require('../services/settings.service');
const { EXPORT_PAGE, EXPORT_OPTIONS } = require('../utils/query');
const { buildWorkbook, sendWorkbook, sendCsv } = require('../reports/excel');
const { streamTableReport } = require('../reports/pdf');

const EXPORT_COLUMNS = [
  { header: 'Identifier', key: 'identifier', width: 2 },
  { header: 'Full name', key: 'fullName', width: 3 },
  { header: 'Email', key: 'email', width: 3 },
  { header: 'Phone', key: 'phone', width: 2 },
  { header: 'Role', key: 'role', width: 1.5 },
  { header: 'Department', key: 'department', width: 2 },
  { header: 'Status', key: 'status', width: 1.2 },
  { header: 'Active loans', key: 'activeLoans', width: 1.2, type: 'number', align: 'right' },
  { header: 'Outstanding fines', key: 'fines', width: 1.5, type: 'money', align: 'right' },
  { header: 'Registered', key: 'createdAt', width: 1.5, type: 'date' },
];

const toExportRow = (u) => ({
  identifier: u.registrationNumber || u.employeeId || '',
  fullName: [u.firstName, u.middleName, u.lastName].filter(Boolean).join(' '),
  email: u.email,
  phone: u.phone || '',
  role: u.role?.name || '',
  department: u.department?.name || '',
  status: u.status,
  activeLoans: u.activeLoanCount || 0,
  fines: Number(u.outstandingFineTotal || 0),
  createdAt: u.createdAt,
});

const list = catchAsync(async (req, res) => {
  const { format, ...query } = req.query;

  if (format && format !== 'json') {
    // Exports lift the interactive page cap but stay bounded.
    const { items, total } = await userService.listUsers({ ...query, ...EXPORT_PAGE }, EXPORT_OPTIONS);
    const rows = items.map(toExportRow);
    const settings = await settingsService.getSettings();
    const meta = {
      generatedBy: req.user.fullName,
      total: rows.length,
      // Say so on the face of the file rather than truncating silently.
      truncatedFrom: total > rows.length ? total : undefined,
    };

    if (format === 'csv') return sendCsv(res, EXPORT_COLUMNS, rows, 'users.csv', meta);
    if (format === 'pdf') {
      return streamTableReport(res, {
        filename: 'users.pdf',
        title: 'Library Members',
        subtitle: 'User register export',
        institution: settings.institution,
        meta,
        columns: EXPORT_COLUMNS,
        rows: rows.map((r) => ({ ...r, createdAt: r.createdAt?.toISOString?.().slice(0, 10) || '', fines: r.fines.toFixed(2) })),
      });
    }
    const workbook = await buildWorkbook({
      title: 'Library Members', subtitle: 'User register export',
      columns: EXPORT_COLUMNS, rows, meta, sheetName: 'Users',
    });
    return sendWorkbook(res, workbook, 'users.xlsx', meta);
  }

  const result = await userService.listUsers(query);
  return paginated(res, { items: result.items, page: result.page, limit: result.limit, total: result.total });
});

const lookup = catchAsync(async (req, res) => {
  const user = await userService.findByIdentifier(req.query.identifier);
  return ok(res, { message: 'Member found', data: user });
});

const getOne = catchAsync(async (req, res) =>
  ok(res, { message: 'User loaded', data: await userService.getUserById(req.params.id) }));

const getActivity = catchAsync(async (req, res) =>
  ok(res, { message: 'Activity loaded', data: await userService.getUserActivity(req.params.id) }));

const create = catchAsync(async (req, res) => {
  const user = await userService.createUser(req.body, req.user, { req });
  return created(res, { message: 'User created successfully', data: user });
});

const update = catchAsync(async (req, res) => {
  const user = await userService.updateUser(req.params.id, req.body, req.user, { req });
  return ok(res, { message: 'User updated successfully', data: user });
});

const changeStatus = catchAsync(async (req, res) => {
  const user = await userService.changeStatus(req.params.id, req.body, req.user, { req });
  return ok(res, { message: `Account marked ${req.body.status}`, data: user });
});

const resetPassword = catchAsync(async (req, res) => {
  await userService.resetUserPassword(req.params.id, req.body.newPassword, req.user, { req });
  return ok(res, { message: 'Password reset. The member must change it at next sign-in.' });
});

const remove = catchAsync(async (req, res) => {
  await userService.softDeleteUser(req.params.id, req.user, { req });
  return ok(res, { message: 'User account deleted' });
});

/** Updates the caller's own editable profile fields. */
const updateOwnProfile = catchAsync(async (req, res) => {
  const allowed = ['phone', 'address', 'gender', 'dateOfBirth'];
  const patch = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)));
  if (!Object.keys(patch).length) throw ApiError.badRequest('No editable profile fields were supplied');
  const user = await userService.updateUser(req.user._id, patch, req.user, { req });
  return ok(res, { message: 'Profile updated', data: user });
});

const importTemplate = catchAsync(async (req, res) => {
  const workbook = await importService.buildTemplate();
  return sendWorkbook(res, workbook, 'student-import-template.xlsx');
});

const importUsers = catchAsync(async (req, res) => {
  if (!req.file) throw ApiError.badRequest('An .xlsx file is required');
  const result = await importService.importStudents(req.file.buffer, req.query, req.user, { req });
  return ok(res, {
    message: `Import finished: ${result.imported} created, ${result.skipped} skipped`,
    data: result,
  });
});

module.exports = {
  list, lookup, getOne, getActivity, create, update, changeStatus,
  resetPassword, remove, updateOwnProfile, importTemplate, importUsers,
};
