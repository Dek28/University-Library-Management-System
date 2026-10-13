const catchAsync = require('../utils/catchAsync');
const { ok, created, paginated } = require('../utils/response');
const inventoryService = require('../services/inventory.service');

const summary = catchAsync(async (req, res) =>
  ok(res, { message: 'Stock summary', data: await inventoryService.stockSummary(req.query) }));

const copiesByStatus = catchAsync(async (req, res) => {
  const result = await inventoryService.listCopiesByStatus(req.params.status, req.query);
  return paginated(res, { items: result.items, page: result.page, limit: result.limit, total: result.total });
});

const listAudits = catchAsync(async (req, res) => {
  const result = await inventoryService.listAudits(req.query);
  return paginated(res, { items: result.items, page: result.page, limit: result.limit, total: result.total });
});

const getAudit = catchAsync(async (req, res) =>
  ok(res, { message: 'Audit loaded', data: await inventoryService.getAudit(req.params.id) }));

const startAudit = catchAsync(async (req, res) =>
  created(res, { message: 'Stock verification started', data: await inventoryService.startAudit(req.body, req.user, { req }) }));

const recordItem = catchAsync(async (req, res) => {
  const result = await inventoryService.recordItem(req.params.id, req.body, req.user, { req });
  return ok(res, { message: `Recorded ${result.copy.accessionNumber} as ${req.body.foundStatus}`, data: result });
});

const completeAudit = catchAsync(async (req, res) => {
  const result = await inventoryService.completeAudit(req.params.id, req.body, req.user, { req });
  return ok(res, {
    message: `Audit completed. ${result.adjustments.length} copy status change(s) applied.`,
    data: result,
  });
});

const cancelAudit = catchAsync(async (req, res) =>
  ok(res, { message: 'Audit cancelled', data: await inventoryService.cancelAudit(req.params.id, req.body.reason, req.user, { req }) }));

const adjustCopy = catchAsync(async (req, res) =>
  ok(res, { message: 'Copy status adjusted', data: await inventoryService.adjustCopy(req.params.copyId, req.body, req.user, { req }) }));

module.exports = {
  summary, copiesByStatus, listAudits, getAudit, startAudit,
  recordItem, completeAudit, cancelAudit, adjustCopy,
};
