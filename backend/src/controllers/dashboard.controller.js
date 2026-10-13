const catchAsync = require('../utils/catchAsync');
const { ok } = require('../utils/response');
const dashboardService = require('../services/dashboard.service');

const admin = catchAsync(async (req, res) =>
  ok(res, { message: 'Administrator dashboard', data: await dashboardService.adminDashboard() }));

const librarian = catchAsync(async (req, res) =>
  ok(res, { message: 'Librarian dashboard', data: await dashboardService.librarianDashboard(req.user._id) }));

const self = catchAsync(async (req, res) =>
  ok(res, { message: 'Member dashboard', data: await dashboardService.memberDashboard(req.user._id) }));

module.exports = { admin, librarian, self };
