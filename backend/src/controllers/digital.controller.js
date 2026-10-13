const catchAsync = require('../utils/catchAsync');
const { ok, created, paginated } = require('../utils/response');
const ApiError = require('../utils/ApiError');
const digitalService = require('../services/digital.service');

const list = catchAsync(async (req, res) => {
  const result = await digitalService.list(req.query, req.user);
  return paginated(res, { items: result.items, page: result.page, limit: result.limit, total: result.total });
});

const getOne = catchAsync(async (req, res) =>
  ok(res, {
    message: 'Repository item loaded',
    data: await digitalService.getById(req.params.id, req.user, { trackView: true }),
  }));

const upload = catchAsync(async (req, res) => {
  if (!req.file) throw ApiError.badRequest('A document file is required');
  const item = await digitalService.upload(req.body, req.file, req.user, { req });
  return created(res, { message: 'Repository item uploaded successfully', data: item });
});

const update = catchAsync(async (req, res) =>
  ok(res, { message: 'Repository item updated', data: await digitalService.update(req.params.id, req.body, req.user, { req }) }));

const remove = catchAsync(async (req, res) => {
  await digitalService.remove(req.params.id, req.user, { req });
  return ok(res, { message: 'Repository item deleted' });
});

/**
 * Streams the stored file. Access is re-checked inside the service, so a
 * direct request for an id the caller may not read behaves exactly like a
 * request for an id that does not exist.
 */
function sendFile(res, { stream, filename, mimeType, fileSize }, disposition) {
  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Length', fileSize);
  res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(filename)}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');

  stream.on('error', (err) => {
    if (!res.headersSent) res.status(500).json({ success: false, message: 'Failed to read the stored file', errors: [] });
    else res.destroy(err);
  });
  stream.pipe(res);
}

const download = catchAsync(async (req, res) => {
  const file = await digitalService.openStream(req.params.id, req.user, { req }, { purpose: 'download' });
  sendFile(res, file, req.query.inline === 'true' ? 'inline' : 'attachment');
});

/** Streams the file for the in-app reader; allowed even when downloads are off. */
const read = catchAsync(async (req, res) => {
  const file = await digitalService.openStream(req.params.id, req.user, { req }, { purpose: 'read' });
  sendFile(res, file, 'inline');
});

module.exports = { list, getOne, upload, update, remove, download, read };
