const catchAsync = require('../utils/catchAsync');
const { ok, paginated } = require('../utils/response');
const authorService = require('../services/author.service');

const list = catchAsync(async (req, res) => {
  const result = await authorService.list(req.query);
  return paginated(res, { items: result.items, page: result.page, limit: result.limit, total: result.total });
});

const getOne = catchAsync(async (req, res) =>
  ok(res, { message: 'Author loaded', data: await authorService.getWithResources(req.params.id, req.query) }));

module.exports = { list, getOne };
