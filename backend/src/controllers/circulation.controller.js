const catchAsync = require('../utils/catchAsync');
const { ok, created, paginated } = require('../utils/response');
const ApiError = require('../utils/ApiError');
const circulationService = require('../services/circulation.service');
const userService = require('../services/user.service');
const settingsService = require('../services/settings.service');
const { has } = require('../middleware/auth');
const { P } = require('../constants/permissions');
const { EXPORT_PAGE, EXPORT_OPTIONS } = require('../utils/query');
const { buildWorkbook, sendWorkbook, sendCsv } = require('../reports/excel');
const { streamTableReport, startDocument, PAGE_MARGIN } = require('../reports/pdf');

const LOAN_COLUMNS = [
  { header: 'Transaction', key: 'transactionId', width: 1.8 },
  { header: 'Member', key: 'member', width: 2.2 },
  { header: 'Identifier', key: 'identifier', width: 1.5 },
  { header: 'Title', key: 'title', width: 3 },
  { header: 'Accession', key: 'accession', width: 1.5 },
  { header: 'Borrowed', key: 'borrowDate', width: 1.3, type: 'date' },
  { header: 'Due', key: 'dueDate', width: 1.3, type: 'date' },
  { header: 'Returned', key: 'returnDate', width: 1.3, type: 'date' },
  { header: 'Status', key: 'status', width: 1 },
  { header: 'Fine', key: 'fineAmount', width: 1, type: 'money', align: 'right' },
];

const toLoanRow = (l, { asText = false } = {}) => {
  const date = (d) => (asText ? (d ? new Date(d).toISOString().slice(0, 10) : '') : (d ? new Date(d) : ''));
  return {
    transactionId: l.transactionId,
    member: l.user ? `${l.user.firstName} ${l.user.lastName}` : '',
    identifier: l.user?.registrationNumber || l.user?.employeeId || '',
    title: l.resource?.title || '',
    accession: l.copy?.accessionNumber || '',
    borrowDate: date(l.borrowDate),
    dueDate: date(l.dueDate),
    returnDate: date(l.returnDate),
    status: l.status,
    fineAmount: asText ? Number(l.fineAmount || 0).toFixed(2) : Number(l.fineAmount || 0),
  };
};

const eligibility = catchAsync(async (req, res) => {
  const userId = req.query.userId
    || (await userService.findByIdentifier(req.query.userIdentifier))._id;
  const data = await circulationService.checkEligibility(userId, { resourceId: req.query.resourceId });
  return ok(res, { message: data.eligible ? 'Member is eligible to borrow' : 'Member is not eligible', data });
});

const issue = catchAsync(async (req, res) => {
  const loan = await circulationService.issue(req.body, req.user, { req });
  return created(res, { message: 'Item issued successfully', data: loan });
});

const returnItem = catchAsync(async (req, res) => {
  const result = await circulationService.returnLoan(req.body, req.user, { req });
  const message = result.fines.length
    ? `Return recorded. ${result.fines.length} fine(s) raised.`
    : 'Return recorded. No fines due.';
  return ok(res, { message, data: result });
});

/** Renewals: staff renew anything, members may only renew their own loans. */
const renew = catchAsync(async (req, res) => {
  const loan = await circulationService.getLoan(req.params.id);
  const isOwner = String(loan.user?.id || loan.user) === String(req.user._id);

  if (!has(req, P.LOAN_RENEW)) {
    if (!isOwner || !has(req, P.LOAN_RENEW_OWN)) throw ApiError.forbidden();
    const settings = await settingsService.getSettings();
    if (!settings.circulation.allowSelfRenewal) {
      throw ApiError.forbidden('Self-service renewal is disabled. Please visit the circulation desk.');
    }
  }

  const updated = await circulationService.renew(
    req.params.id,
    { ...req.body, channel: has(req, P.LOAN_RENEW) ? 'desk' : 'self_service' },
    req.user,
    { req },
  );
  return ok(res, { message: `Loan renewed. New due date: ${updated.dueDate.toISOString().slice(0, 10)}`, data: updated });
});

const markLost = catchAsync(async (req, res) => {
  const result = await circulationService.markLost(req.params.id, req.body, req.user, { req });
  return ok(res, { message: 'Loan marked as lost and charges raised', data: result });
});

const listLoans = catchAsync(async (req, res) => {
  const { format, ...query } = req.query;

  // Members without the global loan permission only ever see their own loans.
  if (!has(req, P.LOAN_VIEW)) query.user = String(req.user._id);

  if (format && format !== 'json') {
    const { items, total } = await circulationService.listLoans({ ...query, ...EXPORT_PAGE }, EXPORT_OPTIONS);
    const settings = await settingsService.getSettings();
    const meta = {
      generatedBy: req.user.fullName,
      period: query.from ? `${query.from} to ${query.to || 'today'}` : 'All time',
      total: items.length,
      truncatedFrom: total > items.length ? total : undefined,
    };

    if (format === 'csv') return sendCsv(res, LOAN_COLUMNS, items.map((l) => toLoanRow(l, { asText: true })), 'loans.csv', meta);
    if (format === 'pdf') {
      return streamTableReport(res, {
        filename: 'loans.pdf',
        title: 'Circulation Report',
        subtitle: 'Loan transactions',
        institution: settings.institution,
        meta,
        columns: LOAN_COLUMNS,
        rows: items.map((l) => toLoanRow(l, { asText: true })),
      });
    }
    const workbook = await buildWorkbook({
      title: 'Circulation Report', subtitle: 'Loan transactions',
      columns: LOAN_COLUMNS, rows: items.map((l) => toLoanRow(l)), meta, sheetName: 'Loans',
    });
    return sendWorkbook(res, workbook, 'loans.xlsx', meta);
  }

  const result = await circulationService.listLoans(query);
  return paginated(res, { items: result.items, page: result.page, limit: result.limit, total: result.total });
});

const getLoan = catchAsync(async (req, res) => {
  const loan = await circulationService.getLoan(req.params.id);
  if (!has(req, P.LOAN_VIEW) && String(loan.user?.id || loan.user) !== String(req.user._id)) {
    throw ApiError.forbidden();
  }
  return ok(res, { message: 'Loan loaded', data: loan });
});

const listRenewals = catchAsync(async (req, res) => {
  const query = { ...req.query };
  if (!has(req, P.LOAN_VIEW)) query.user = String(req.user._id);
  const result = await circulationService.listRenewals(query);
  return paginated(res, { items: result.items, page: result.page, limit: result.limit, total: result.total });
});

const deskSummary = catchAsync(async (req, res) =>
  ok(res, { message: 'Circulation desk summary', data: await circulationService.deskSummary() }));

/** Printable issue/return slip for the circulation desk. */
const receipt = catchAsync(async (req, res) => {
  const loan = await circulationService.getLoan(req.params.id);
  if (!has(req, P.LOAN_VIEW) && String(loan.user?.id || loan.user) !== String(req.user._id)) {
    throw ApiError.forbidden();
  }
  const settings = await settingsService.getSettings();
  const symbol = settings.locale?.currencySymbol || '';

  const doc = startDocument(res, {
    filename: `loan-${loan.transactionId}.pdf`,
    title: 'Loan Receipt',
    subtitle: `Transaction ${loan.transactionId}`,
    institution: settings.institution,
    meta: { generatedBy: req.user.fullName },
  });

  const lines = [
    ['Member', `${loan.user?.firstName || ''} ${loan.user?.lastName || ''}`.trim()],
    ['Identifier', loan.user?.registrationNumber || loan.user?.employeeId || ''],
    ['Title', loan.resource?.title || ''],
    ['Accession number', loan.copy?.accessionNumber || ''],
    ['Barcode', loan.copy?.barcode || ''],
    ['Borrowed on', new Date(loan.borrowDate).toISOString().slice(0, 10)],
    ['Due on', new Date(loan.dueDate).toISOString().slice(0, 10)],
    ['Returned on', loan.returnDate ? new Date(loan.returnDate).toISOString().slice(0, 10) : '-'],
    ['Status', loan.status],
    ['Renewals', `${loan.renewalCount} of ${loan.maxRenewals}`],
    ['Fines raised', `${symbol}${Number(loan.fineAmount || 0).toFixed(2)}`],
    ['Issued by', loan.issuedBy ? `${loan.issuedBy.firstName} ${loan.issuedBy.lastName}` : ''],
  ];

  doc.moveDown(0.5);
  lines.forEach(([label, value]) => {
    const y = doc.y;
    doc.fontSize(9).fillColor('#6B7280').text(label, PAGE_MARGIN, y, { width: 140 });
    doc.fontSize(10).fillColor('#111827').text(String(value), PAGE_MARGIN + 150, y);
    doc.moveDown(0.4);
  });

  doc.moveDown(2);
  doc.fontSize(8).fillColor('#6B7280')
    .text('Please return items by the due date. Overdue items attract fines as published in the library policy.',
      PAGE_MARGIN, doc.y, { width: doc.page.width - PAGE_MARGIN * 2 });

  doc.end();
});

module.exports = {
  eligibility, issue, returnItem, renew, markLost, listLoans, getLoan,
  listRenewals, deskSummary, receipt,
};
