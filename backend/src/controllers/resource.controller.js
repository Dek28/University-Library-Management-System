const catchAsync = require('../utils/catchAsync');
const { ok, created, paginated } = require('../utils/response');
const ApiError = require('../utils/ApiError');
const resourceService = require('../services/resource.service');
const importService = require('../services/resourceImport.service');
const settingsService = require('../services/settings.service');
const { EXPORT_PAGE, EXPORT_OPTIONS } = require('../utils/query');
const { buildWorkbook, sendWorkbook, sendCsv } = require('../reports/excel');
const { streamTableReport } = require('../reports/pdf');

const EXPORT_COLUMNS = [
  { header: 'Title', key: 'title', width: 3.5 },
  { header: 'Type', key: 'resourceType', width: 1.2 },
  { header: 'Authors', key: 'authors', width: 2.5 },
  { header: 'Publisher', key: 'publisher', width: 2 },
  { header: 'Year', key: 'year', width: 0.8, type: 'number' },
  { header: 'ISBN', key: 'isbn', width: 1.5 },
  { header: 'Copies', key: 'totalCopies', width: 0.8, type: 'number', align: 'right' },
  { header: 'Available', key: 'availableCopies', width: 0.9, type: 'number', align: 'right' },
  { header: 'Status', key: 'status', width: 1.2 },
];

const toExportRow = (r) => ({
  title: r.title,
  resourceType: r.resourceType,
  authors: (r.authors || []).map((a) => a.fullName).join('; '),
  publisher: r.publisher?.name || '',
  year: r.publicationYear || '',
  isbn: r.isbn || '',
  totalCopies: r.totalCopies || 0,
  availableCopies: r.availableCopies || 0,
  status: r.status,
});

const search = catchAsync(async (req, res) => {
  const { format, ...query } = req.query;

  if (format && format !== 'json') {
    const { items, total } = await resourceService.search({ ...query, ...EXPORT_PAGE }, EXPORT_OPTIONS);
    const rows = items.map(toExportRow);
    const settings = await settingsService.getSettings();
    const meta = {
      generatedBy: req.user.fullName,
      total: rows.length,
      truncatedFrom: total > rows.length ? total : undefined,
    };

    if (format === 'csv') return sendCsv(res, EXPORT_COLUMNS, rows, 'catalogue.csv', meta);
    if (format === 'pdf') {
      return streamTableReport(res, {
        filename: 'catalogue.pdf',
        title: 'Library Catalogue',
        subtitle: 'Catalogue export',
        institution: settings.institution,
        meta,
        columns: EXPORT_COLUMNS,
        rows,
      });
    }
    const workbook = await buildWorkbook({
      title: 'Library Catalogue', subtitle: 'Catalogue export',
      columns: EXPORT_COLUMNS, rows, meta, sheetName: 'Catalogue',
    });
    return sendWorkbook(res, workbook, 'catalogue.xlsx', meta);
  }

  const result = await resourceService.search(query);
  return paginated(res, { items: result.items, page: result.page, limit: result.limit, total: result.total });
});

const suggest = catchAsync(async (req, res) =>
  ok(res, { message: 'Suggestions', data: await resourceService.suggest(req.query.q, req.query.limit) }));

const discovery = catchAsync(async (req, res) => {
  const [recent, popular] = await Promise.all([
    resourceService.recentlyAdded(8),
    resourceService.mostBorrowed(8),
  ]);
  return ok(res, { message: 'Discovery lists', data: { recentlyAdded: recent, mostBorrowed: popular } });
});

const getOne = catchAsync(async (req, res) => {
  const data = await resourceService.getById(req.params.id, {
    includeCopies: req.query.includeCopies !== false,
    trackView: true,
  });
  return ok(res, { message: 'Catalogue record loaded', data });
});

const getRelated = catchAsync(async (req, res) =>
  ok(res, { message: 'Related resources', data: await resourceService.related(req.params.id) }));

const create = catchAsync(async (req, res) =>
  created(res, { message: 'Catalogue record created', data: await resourceService.create(req.body, req.user, { req }) }));

const update = catchAsync(async (req, res) =>
  ok(res, { message: 'Catalogue record updated', data: await resourceService.update(req.params.id, req.body, req.user, { req }) }));

const remove = catchAsync(async (req, res) => {
  await resourceService.remove(req.params.id, req.user, { req });
  return ok(res, { message: 'Catalogue record deleted' });
});

const uploadCover = catchAsync(async (req, res) => {
  if (!req.file) throw ApiError.badRequest('An image file is required');
  const url = await resourceService.setCoverImage(req.params.id, req.file, req.user, { req });
  return ok(res, { message: 'Cover image updated', data: { coverImage: url } });
});

const importTemplate = catchAsync(async (req, res) => {
  const workbook = await importService.buildTemplate();
  return sendWorkbook(res, workbook, 'catalogue-import-template.xlsx');
});

const inspectImport = catchAsync(async (req, res) => {
  if (!req.file) throw ApiError.badRequest('Choose an .xlsx or .csv file');
  const data = await importService.inspect(req.file.buffer, req.file.originalname);
  return ok(res, { message: `${data.totalRows} row(s) found`, data });
});

const importResources = catchAsync(async (req, res) => {
  if (!req.file) throw ApiError.badRequest('Choose an .xlsx or .csv file');
  const result = await importService.importResources(req.file.buffer, req.file.originalname, req.body, req.user, { req });
  return ok(res, {
    message: req.body.dryRun
      ? `Validation finished: ${result.imported} of ${result.total} row(s) are ready to import`
      : `Import finished: ${result.imported} created, ${result.skipped} skipped`,
    data: result,
  });
});

module.exports = {
  search, suggest, discovery, getOne, getRelated, create, update, remove, uploadCover,
  importTemplate, inspectImport, importResources,
};
