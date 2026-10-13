const catchAsync = require('../utils/catchAsync');
const { ok, created, paginated } = require('../utils/response');
const referenceService = require('../services/reference.service');

const listCollections = catchAsync(async (req, res) =>
  ok(res, { message: 'Reference collections', data: referenceService.collections() }));

const list = catchAsync(async (req, res) => {
  const result = await referenceService.list(req.params.collection, req.query);
  return paginated(res, { items: result.items, page: result.page, limit: result.limit, total: result.total });
});

const getOne = catchAsync(async (req, res) =>
  ok(res, { message: 'Record loaded', data: await referenceService.getById(req.params.collection, req.params.id) }));

const create = catchAsync(async (req, res) => {
  const doc = await referenceService.create(req.params.collection, req.body, req.user, { req });
  return created(res, { message: 'Record created successfully', data: doc });
});

const update = catchAsync(async (req, res) => {
  const doc = await referenceService.update(req.params.collection, req.params.id, req.body, req.user, { req });
  return ok(res, { message: 'Record updated successfully', data: doc });
});

const remove = catchAsync(async (req, res) => {
  await referenceService.remove(req.params.collection, req.params.id, req.user, { req });
  return ok(res, { message: 'Record deleted successfully' });
});

module.exports = { listCollections, list, getOne, create, update, remove };
