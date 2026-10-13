const catchAsync = require('../utils/catchAsync');
const { ok, created, paginated } = require('../utils/response');
const ApiError = require('../utils/ApiError');
const clearanceService = require('../services/clearance.service');
const userService = require('../services/user.service');
const settingsService = require('../services/settings.service');
const { has } = require('../middleware/auth');
const { P } = require('../constants/permissions');
const { EXPORT_PAGE, EXPORT_OPTIONS } = require('../utils/query');
const { buildWorkbook, sendWorkbook, sendCsv } = require('../reports/excel');
const { streamTableReport, startDocument, PAGE_MARGIN } = require('../reports/pdf');

const COLUMNS = [
  { header: 'Clearance code', key: 'clearanceCode', width: 1.8 },
  { header: 'Member', key: 'member', width: 2.2 },
  { header: 'Identifier', key: 'identifier', width: 1.5 },
  { header: 'Department', key: 'department', width: 2 },
  { header: 'Program', key: 'program', width: 2 },
  { header: 'Outstanding items', key: 'activeLoans', width: 1.2, type: 'number', align: 'right' },
  { header: 'Outstanding fines', key: 'fines', width: 1.4, type: 'money', align: 'right' },
  { header: 'Status', key: 'status', width: 1.2 },
  { header: 'Verified by', key: 'verifiedBy', width: 1.8 },
  { header: 'Verified on', key: 'verifiedAt', width: 1.4, type: 'date' },
];

const toRow = (c, { asText = false } = {}) => ({
  clearanceCode: c.clearanceCode,
  member: c.user ? `${c.user.firstName} ${c.user.lastName}` : '',
  identifier: c.user?.registrationNumber || c.user?.employeeId || '',
  department: c.user?.department?.name || '',
  program: c.user?.program?.name || '',
  activeLoans: c.obligations?.activeLoans || 0,
  fines: asText ? Number(c.obligations?.outstandingFineTotal || 0).toFixed(2) : Number(c.obligations?.outstandingFineTotal || 0),
  status: c.isOverride ? `${c.status} (override)` : c.status,
  verifiedBy: c.verifiedBy ? `${c.verifiedBy.firstName} ${c.verifiedBy.lastName}` : '',
  verifiedAt: c.verifiedAt ? (asText ? new Date(c.verifiedAt).toISOString().slice(0, 10) : new Date(c.verifiedAt)) : '',
});

const check = catchAsync(async (req, res) => {
  const userId = req.query.userId || (await userService.findByIdentifier(req.query.identifier))._id;
  const data = await clearanceService.checkMember(userId);
  return ok(res, { message: data.isClear ? 'Member has no outstanding obligations' : 'Member has outstanding obligations', data });
});

const list = catchAsync(async (req, res) => {
  const { format, ...query } = req.query;

  if (format && format !== 'json') {
    const { items, total } = await clearanceService.list({ ...query, ...EXPORT_PAGE }, EXPORT_OPTIONS);
    const settings = await settingsService.getSettings();
    const meta = {
      generatedBy: req.user.fullName,
      total: items.length,
      truncatedFrom: total > items.length ? total : undefined,
    };

    if (format === 'csv') return sendCsv(res, COLUMNS, items.map((c) => toRow(c, { asText: true })), 'clearance.csv', meta);
    if (format === 'pdf') {
      return streamTableReport(res, {
        filename: 'clearance.pdf',
        title: 'Library Clearance Report',
        subtitle: query.status ? `Status: ${query.status}` : 'All clearance records',
        institution: settings.institution,
        meta,
        columns: COLUMNS,
        rows: items.map((c) => toRow(c, { asText: true })),
      });
    }
    const workbook = await buildWorkbook({
      title: 'Library Clearance Report', subtitle: 'Clearance register',
      columns: COLUMNS, rows: items.map((c) => toRow(c)), meta, sheetName: 'Clearance',
    });
    return sendWorkbook(res, workbook, 'clearance.xlsx', meta);
  }

  const result = await clearanceService.list(query);
  return paginated(res, { items: result.items, page: result.page, limit: result.limit, total: result.total });
});

const getOne = catchAsync(async (req, res) =>
  ok(res, { message: 'Clearance record loaded', data: await clearanceService.getById(req.params.id) }));

const requestForMember = catchAsync(async (req, res) => {
  const clearance = await clearanceService.request(req.body.user, req.user, { req });
  return created(res, { message: 'Clearance check recorded', data: clearance });
});

const requestOwn = catchAsync(async (req, res) => {
  const clearance = await clearanceService.request(req.user._id, req.user, { req });
  return created(res, { message: 'Clearance request submitted', data: clearance });
});

const getOwn = catchAsync(async (req, res) =>
  ok(res, { message: 'Clearance status', data: await clearanceService.getOwn(req.user._id) }));

const approve = catchAsync(async (req, res) => {
  const clearance = await clearanceService.approve(
    req.params.id,
    req.body,
    req.user,
    { canOverride: has(req, P.CLEARANCE_OVERRIDE) },
    { req },
  );
  return ok(res, {
    message: clearance.isOverride ? 'Clearance granted by authorised override' : 'Clearance granted',
    data: clearance,
  });
});

const reject = catchAsync(async (req, res) =>
  ok(res, { message: 'Clearance rejected', data: await clearanceService.reject(req.params.id, req.body, req.user, { req }) }));

const statistics = catchAsync(async (req, res) =>
  ok(res, { message: 'Clearance statistics', data: await clearanceService.statistics() }));

/** Printable clearance certificate; only issued for a granted clearance. */
const certificate = catchAsync(async (req, res) => {
  const clearance = await clearanceService.getById(req.params.id);
  const isOwner = String(clearance.user?._id) === String(req.user._id);
  if (!isOwner && !has(req, P.CLEARANCE_VIEW)) throw ApiError.forbidden();
  if (clearance.status !== 'cleared') {
    throw ApiError.badRequest('A certificate can only be issued for a granted clearance');
  }

  const settings = await settingsService.getSettings();
  const doc = startDocument(res, {
    filename: `clearance-${clearance.clearanceCode}.pdf`,
    title: 'Library Clearance Certificate',
    subtitle: `Certificate number ${clearance.certificateNumber}`,
    institution: settings.institution,
    meta: { generatedBy: req.user.fullName },
  });

  const user = clearance.user || {};
  const rows = [
    ['Member name', [user.firstName, user.middleName, user.lastName].filter(Boolean).join(' ')],
    ['Identifier', user.registrationNumber || user.employeeId || ''],
    ['Faculty', user.faculty?.name || '-'],
    ['Department', user.department?.name || '-'],
    ['Program', user.program?.name || '-'],
    ['Graduation year', user.graduationYear || '-'],
    ['Items on loan at approval', clearance.obligations?.activeLoans ?? 0],
    ['Outstanding fines at approval', Number(clearance.obligations?.outstandingFineTotal || 0).toFixed(2)],
    ['Clearance status', clearance.status],
    ['Verified by', clearance.verifiedBy ? `${clearance.verifiedBy.firstName} ${clearance.verifiedBy.lastName}` : ''],
    ['Verified on', clearance.verifiedAt ? new Date(clearance.verifiedAt).toISOString().slice(0, 10) : ''],
  ];

  doc.moveDown(0.5);
  rows.forEach(([label, value]) => {
    const y = doc.y;
    doc.fontSize(9).fillColor('#6B7280').text(label, PAGE_MARGIN, y, { width: 170 });
    doc.fontSize(10).fillColor('#111827').text(String(value), PAGE_MARGIN + 180, y);
    doc.moveDown(0.45);
  });

  if (clearance.isOverride) {
    doc.moveDown(0.8);
    doc.fontSize(9).fillColor('#B45309')
      .text(`Granted by authorised override: ${clearance.overrideReason}`, PAGE_MARGIN, doc.y, {
        width: doc.page.width - PAGE_MARGIN * 2,
      });
  }

  doc.moveDown(2);
  doc.fontSize(10).fillColor('#111827')
    .text('This is to certify that the member named above has no outstanding library obligations '
      + 'as at the verification date shown.', PAGE_MARGIN, doc.y, { width: doc.page.width - PAGE_MARGIN * 2 });

  doc.moveDown(3);
  doc.fontSize(9).fillColor('#6B7280').text('_______________________________', PAGE_MARGIN, doc.y);
  doc.text('Authorised library officer', PAGE_MARGIN, doc.y + 2);

  doc.end();
});

module.exports = {
  check, list, getOne, requestForMember, requestOwn, getOwn,
  approve, reject, statistics, certificate,
};
