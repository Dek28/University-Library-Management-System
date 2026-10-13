const catchAsync = require('../utils/catchAsync');
const { ok, created, paginated } = require('../utils/response');
const ApiError = require('../utils/ApiError');
const groupService = require('../services/readingGroup.service');
const { has } = require('../middleware/auth');
const { P } = require('../constants/permissions');

const listGroups = catchAsync(async (req, res) => {
  const query = { ...req.query };
  // Members without the manage/view permission only see groups they belong to.
  if (!has(req, P.GROUP_VIEW)) query.member = String(req.user._id);
  const result = await groupService.listGroups(query);
  return paginated(res, { items: result.items, page: result.page, limit: result.limit, total: result.total });
});

const getGroup = catchAsync(async (req, res) => {
  const group = await groupService.getGroup(req.params.id);
  if (!has(req, P.GROUP_VIEW)) {
    const isMember = (group.members || []).some((m) => String(m.id || m._id || m) === String(req.user._id));
    if (!isMember) throw ApiError.forbidden();
  }
  return ok(res, { message: 'Reading group loaded', data: group });
});

const createGroup = catchAsync(async (req, res) =>
  created(res, { message: 'Reading group created', data: await groupService.createGroup(req.body, req.user, { req }) }));

const updateGroup = catchAsync(async (req, res) =>
  ok(res, { message: 'Reading group updated', data: await groupService.updateGroup(req.params.id, req.body, req.user, { req }) }));

const setMembers = catchAsync(async (req, res) =>
  ok(res, { message: 'Membership updated', data: await groupService.setMembers(req.params.id, req.body, req.user, { req }) }));

const removeGroup = catchAsync(async (req, res) => {
  await groupService.removeGroup(req.params.id, req.user, { req });
  return ok(res, { message: 'Reading group deleted' });
});

const listSessions = catchAsync(async (req, res) => {
  const result = await groupService.listSessions(req.query);
  return paginated(res, { items: result.items, page: result.page, limit: result.limit, total: result.total });
});

const getSession = catchAsync(async (req, res) =>
  ok(res, { message: 'Session loaded', data: await groupService.getSession(req.params.id) }));

const scheduleSession = catchAsync(async (req, res) =>
  created(res, { message: 'Session scheduled', data: await groupService.scheduleSession(req.body, req.user, { req }) }));

const updateSession = catchAsync(async (req, res) =>
  ok(res, { message: 'Session updated', data: await groupService.updateSession(req.params.id, req.body, req.user, { req }) }));

const cancelSession = catchAsync(async (req, res) =>
  ok(res, { message: 'Session cancelled', data: await groupService.cancelSession(req.params.id, req.body.reason, req.user, { req }) }));

const recordAttendance = catchAsync(async (req, res) => {
  const data = await groupService.recordAttendance(req.params.id, req.body.entries, req.user, { req });
  return ok(res, { message: `Attendance recorded for ${req.body.entries.length} member(s)`, data });
});

const schedule = catchAsync(async (req, res) =>
  ok(res, { message: 'Reading room schedule', data: await groupService.schedule(req.query) }));

const statistics = catchAsync(async (req, res) =>
  ok(res, { message: 'Reading group statistics', data: await groupService.statistics(req.query) }));

module.exports = {
  listGroups, getGroup, createGroup, updateGroup, setMembers, removeGroup,
  listSessions, getSession, scheduleSession, updateSession, cancelSession,
  recordAttendance, schedule, statistics,
};
