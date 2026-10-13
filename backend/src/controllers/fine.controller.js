const catchAsync = require('../utils/catchAsync');
const { ok, created, paginated } = require('../utils/response');
const ApiError = require('../utils/ApiError');
const fineService = require('../services/fine.service');
const settingsService = require('../services/settings.service');
const { has } = require('../middleware/auth');
const { P } = require('../constants/permissions');
const { EXPORT_PAGE, EXPORT_OPTIONS } = require('../utils/query');
const { buildWorkbook, sendWorkbook, sendCsv } = require('../reports/excel');
const { streamTableReport, startDocument, PAGE_MARGIN } = require('../reports/pdf');

const FINE_COLUMNS = [
  { header: 'Fine code', key: 'fineCode', width: 1.8 },
  { header: 'Member', key: 'member', width: 2.2 },
  { header: 'Identifier', key: 'identifier', width: 1.5 },
  { header: 'Type', key: 'fineType', width: 1.2 },
  { header: 'Title', key: 'title', width: 2.5 },
  { header: 'Amount', key: 'amount', width: 1, type: 'money', align: 'right' },
  { header: 'Paid', key: 'amountPaid', width: 1, type: 'money', align: 'right' },
  { header: 'Waived', key: 'amountWaived', width: 1, type: 'money', align: 'right' },
  { header: 'Balance', key: 'balance', width: 1, type: 'money', align: 'right' },
  { header: 'Status', key: 'status', width: 1.2 },
  { header: 'Raised', key: 'createdAt', width: 1.3, type: 'date' },
];

const toFineRow = (f, { asText = false } = {}) => {
  const num = (v) => (asText ? Number(v || 0).toFixed(2) : Number(v || 0));
  return {
    fineCode: f.fineCode,
    member: f.user ? `${f.user.firstName} ${f.user.lastName}` : '',
    identifier: f.user?.registrationNumber || f.user?.employeeId || '',
    fineType: f.fineType,
    title: f.resource?.title || '',
    amount: num(f.amount),
    amountPaid: num(f.amountPaid),
    amountWaived: num(f.amountWaived),
    balance: num(f.balance ?? f.amount - f.amountPaid - f.amountWaived),
    status: f.status,
    createdAt: asText ? new Date(f.createdAt).toISOString().slice(0, 10) : new Date(f.createdAt),
  };
};

const list = catchAsync(async (req, res) => {
  const { format, ...query } = req.query;
  if (!has(req, P.FINE_VIEW)) query.user = String(req.user._id);

  if (format && format !== 'json') {
    const { items, total } = await fineService.list({ ...query, ...EXPORT_PAGE }, EXPORT_OPTIONS);
    const settings = await settingsService.getSettings();
    const meta = {
      generatedBy: req.user.fullName,
      period: query.from ? `${query.from} to ${query.to || 'today'}` : 'All time',
      total: items.length,
      truncatedFrom: total > items.length ? total : undefined,
    };

    if (format === 'csv') return sendCsv(res, FINE_COLUMNS, items.map((f) => toFineRow(f, { asText: true })), 'fines.csv', meta);
    if (format === 'pdf') {
      return streamTableReport(res, {
        filename: 'fines.pdf',
        title: 'Fines Report',
        subtitle: 'Library charges',
        institution: settings.institution,
        meta,
        columns: FINE_COLUMNS,
        rows: items.map((f) => toFineRow(f, { asText: true })),
      });
    }
    const workbook = await buildWorkbook({
      title: 'Fines Report', subtitle: 'Library charges',
      columns: FINE_COLUMNS, rows: items.map((f) => toFineRow(f)), meta, sheetName: 'Fines',
    });
    return sendWorkbook(res, workbook, 'fines.xlsx', meta);
  }

  const result = await fineService.list(query);
  return paginated(res, { items: result.items, page: result.page, limit: result.limit, total: result.total });
});

const getOne = catchAsync(async (req, res) => {
  const fine = await fineService.getById(req.params.id);
  if (!has(req, P.FINE_VIEW) && String(fine.user?.id || fine.user) !== String(req.user._id)) {
    throw ApiError.forbidden();
  }
  return ok(res, { message: 'Fine loaded', data: fine });
});

const myOutstanding = catchAsync(async (req, res) =>
  ok(res, { message: 'Outstanding balance', data: await fineService.getOutstandingForUser(req.user._id) }));

const outstandingForUser = catchAsync(async (req, res) =>
  ok(res, { message: 'Outstanding balance', data: await fineService.getOutstandingForUser(req.params.userId) }));

const createManual = catchAsync(async (req, res) =>
  created(res, { message: 'Fine raised successfully', data: await fineService.createManualFine(req.body, req.user, { req }) }));

const pay = catchAsync(async (req, res) => {
  const result = await fineService.addPayment(req.params.id, req.body, req.user, { req });
  return ok(res, { message: `Payment recorded. Receipt ${result.payment.receiptNumber}`, data: result });
});

const waive = catchAsync(async (req, res) =>
  ok(res, { message: 'Fine waived', data: await fineService.waive(req.params.id, req.body, req.user, { req }) }));

const cancel = catchAsync(async (req, res) =>
  ok(res, { message: 'Fine cancelled', data: await fineService.cancel(req.params.id, req.body.reason, req.user, { req }) }));

const summary = catchAsync(async (req, res) =>
  ok(res, { message: 'Fine summary', data: await fineService.summary(req.query) }));

const payments = catchAsync(async (req, res) => {
  const query = { ...req.query };
  if (!has(req, P.FINE_VIEW)) query.user = String(req.user._id);
  const result = await fineService.paymentHistory(query);
  return paginated(res, { items: result.items, page: result.page, limit: result.limit, total: result.total });
});

/** Printable payment receipt. */
const receipt = catchAsync(async (req, res) => {
  const fine = await fineService.getById(req.params.id);
  if (!has(req, P.FINE_VIEW) && String(fine.user?.id || fine.user) !== String(req.user._id)) {
    throw ApiError.forbidden();
  }
  const settings = await settingsService.getSettings();
  const symbol = settings.locale?.currencySymbol || '';

  const doc = startDocument(res, {
    filename: `fine-${fine.fineCode}.pdf`,
    title: 'Fine Statement',
    subtitle: `Reference ${fine.fineCode}`,
    institution: settings.institution,
    meta: { generatedBy: req.user.fullName },
  });

  const rows = [
    ['Member', `${fine.user?.firstName || ''} ${fine.user?.lastName || ''}`.trim()],
    ['Identifier', fine.user?.registrationNumber || fine.user?.employeeId || ''],
    ['Fine type', fine.fineType],
    ['Reason', fine.reason || '-'],
    ['Title', fine.resource?.title || '-'],
    ['Amount charged', `${symbol}${Number(fine.amount).toFixed(2)}`],
    ['Amount paid', `${symbol}${Number(fine.amountPaid).toFixed(2)}`],
    ['Amount waived', `${symbol}${Number(fine.amountWaived).toFixed(2)}`],
    ['Balance', `${symbol}${Number(fine.balance).toFixed(2)}`],
    ['Status', fine.status],
  ];

  doc.moveDown(0.5);
  rows.forEach(([label, value]) => {
    const y = doc.y;
    doc.fontSize(9).fillColor('#6B7280').text(label, PAGE_MARGIN, y, { width: 140 });
    doc.fontSize(10).fillColor('#111827').text(String(value), PAGE_MARGIN + 150, y);
    doc.moveDown(0.4);
  });

  if (fine.payments?.length) {
    doc.moveDown(1);
    doc.fontSize(11).fillColor('#111827').font('Helvetica-Bold').text('Payment history', PAGE_MARGIN, doc.y);
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(9);
    fine.payments.forEach((p) => {
      doc.fillColor('#374151').text(
        `${new Date(p.paidAt).toISOString().slice(0, 10)}  ·  ${p.kind}  ·  ${symbol}${Number(p.amount).toFixed(2)}`
        + `  ·  ${p.method}  ·  receipt ${p.receiptNumber}`,
        PAGE_MARGIN, doc.y,
      );
      doc.moveDown(0.25);
    });
  }

  doc.end();
});

module.exports = {
  list, getOne, myOutstanding, outstandingForUser, createManual,
  pay, waive, cancel, summary, payments, receipt,
};
