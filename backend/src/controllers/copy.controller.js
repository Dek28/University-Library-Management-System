const catchAsync = require('../utils/catchAsync');
const { ok, created, paginated } = require('../utils/response');
const copyService = require('../services/copy.service');
const { Shelf } = require('../models/reference');
const { EXPORT_PAGE, EXPORT_OPTIONS } = require('../utils/query');
const { buildWorkbook, sendWorkbook, sendCsv } = require('../reports/excel');

const EXPORT_COLUMNS = [
  { header: 'Accession number', key: 'accessionNumber', width: 2 },
  { header: 'Barcode', key: 'barcode', width: 2 },
  { header: 'Title', key: 'title', width: 3.5 },
  { header: 'Shelf', key: 'shelf', width: 1.5 },
  { header: 'Status', key: 'status', width: 1.2 },
  { header: 'Condition', key: 'condition', width: 1.2 },
  { header: 'Times borrowed', key: 'borrowCount', width: 1.2, type: 'number' },
  { header: 'Acquired', key: 'acquisitionDate', width: 1.4, type: 'date' },
];

const toExportRow = (c) => ({
  accessionNumber: c.accessionNumber,
  barcode: c.barcode,
  title: c.resource?.title || '',
  shelf: Shelf.labelOf(c.shelf),
  status: c.status,
  condition: c.condition,
  borrowCount: c.borrowCount || 0,
  acquisitionDate: c.acquisitionDate,
});

const list = catchAsync(async (req, res) => {
  const { format, ...query } = req.query;

  if (format && format !== 'json') {
    const { items, total } = await copyService.list({ ...query, ...EXPORT_PAGE }, EXPORT_OPTIONS);
    const rows = items.map(toExportRow);
    const meta = {
      generatedBy: req.user.fullName,
      total: rows.length,
      truncatedFrom: total > rows.length ? total : undefined,
    };
    if (format === 'csv') return sendCsv(res, EXPORT_COLUMNS, rows, 'copies.csv', meta);
    const workbook = await buildWorkbook({
      title: 'Physical Copies', subtitle: 'Inventory export',
      columns: EXPORT_COLUMNS, rows, meta, sheetName: 'Copies',
    });
    return sendWorkbook(res, workbook, 'copies.xlsx', meta);
  }

  const result = await copyService.list(query);
  return paginated(res, { items: result.items, page: result.page, limit: result.limit, total: result.total });
});

const lookup = catchAsync(async (req, res) =>
  ok(res, { message: 'Copy found', data: await copyService.findByIdentifier(req.query.identifier) }));

const getOne = catchAsync(async (req, res) =>
  ok(res, { message: 'Copy loaded', data: await copyService.getById(req.params.id) }));

const create = catchAsync(async (req, res) =>
  created(res, { message: 'Copy added successfully', data: await copyService.create(req.body, req.user, { req }) }));

const createBatch = catchAsync(async (req, res) => {
  const copies = await copyService.createBatch(req.body, req.user, { req });
  return created(res, { message: `${copies.length} copies added successfully`, data: copies });
});

const update = catchAsync(async (req, res) =>
  ok(res, { message: 'Copy updated successfully', data: await copyService.update(req.params.id, req.body, req.user, { req }) }));

const remove = catchAsync(async (req, res) => {
  await copyService.remove(req.params.id, req.user, { req });
  return ok(res, { message: 'Copy removed from circulation' });
});

module.exports = { list, lookup, getOne, create, createBatch, update, remove };
