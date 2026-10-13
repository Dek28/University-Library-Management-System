const mongoose = require('mongoose');
const Resource = require('../models/Resource');
const ResourceCopy = require('../models/ResourceCopy');
const Loan = require('../models/Loan');
const Fine = require('../models/Fine');
const User = require('../models/User');
const Role = require('../models/Role');
const Reservation = require('../models/Reservation');
const DigitalResource = require('../models/DigitalResource');
const Clearance = require('../models/Clearance');
const Notification = require('../models/Notification');
const { ReadingGroup, ReadingGroupSession } = require('../models/readingGroup');
const { startOfDay, endOfDay, addDays, dayjs } = require('../utils/datetime');
const resourceService = require('./resource.service');
const fineService = require('./fine.service');

const oid = (id) => new mongoose.Types.ObjectId(String(id));

/** Monthly issue/return counts for the last `months` months. */
async function circulationTrend(months = 6) {
  const since = dayjs().subtract(months - 1, 'month').startOf('month').toDate();

  const [issued, returned] = await Promise.all([
    Loan.aggregate([
      { $match: { borrowDate: { $gte: since } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$borrowDate' } }, count: { $sum: 1 } } },
    ]),
    Loan.aggregate([
      { $match: { returnDate: { $gte: since } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$returnDate' } }, count: { $sum: 1 } } },
    ]),
  ]);

  const issuedMap = Object.fromEntries(issued.map((r) => [r._id, r.count]));
  const returnedMap = Object.fromEntries(returned.map((r) => [r._id, r.count]));

  // Emit a continuous series so the chart has no gaps.
  return Array.from({ length: months }, (unused, index) => {
    const month = dayjs().subtract(months - 1 - index, 'month');
    const key = month.format('YYYY-MM');
    return { month: key, label: month.format('MMM YYYY'), issued: issuedMap[key] || 0, returned: returnedMap[key] || 0 };
  });
}

async function adminDashboard() {
  const todayStart = startOfDay();
  const todayEnd = endOfDay();

  const [
    totalResources, totalCopies, copyStatuses, loanStatuses,
    overdueCount, totalMembers, roleCounts, fineSummary,
    pendingClearance, digitalCount, activeGroups, groupsToday,
    reservationsPending, reservationsReady,
  ] = await Promise.all([
    Resource.countDocuments(),
    ResourceCopy.countDocuments(),
    ResourceCopy.aggregate([{ $match: { isDeleted: { $ne: true } } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Loan.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Loan.countDocuments({ status: { $in: ['active', 'overdue'] }, dueDate: { $lt: new Date() } }),
    User.countDocuments({ status: 'active' }),
    User.aggregate([
      { $match: { isDeleted: { $ne: true }, status: 'active' } },
      { $group: { _id: '$role', count: { $sum: 1 } } },
      { $lookup: { from: 'roles', localField: '_id', foreignField: '_id', as: 'role' } },
      { $project: { key: { $first: '$role.key' }, name: { $first: '$role.name' }, count: 1 } },
    ]),
    fineService.summary(),
    Clearance.countDocuments({ status: { $in: ['pending', 'blocked'] } }),
    DigitalResource.countDocuments({ isPublished: true }),
    ReadingGroup.countDocuments({ status: 'active' }),
    ReadingGroupSession.countDocuments({ startsAt: { $gte: todayStart, $lte: todayEnd }, status: { $in: ['planned', 'active'] } }),
    Reservation.countDocuments({ status: 'pending' }),
    Reservation.countDocuments({ status: 'ready' }),
  ]);

  const copyByStatus = copyStatuses.reduce((acc, r) => { acc[r._id] = r.count; return acc; }, {});
  const loanByStatus = loanStatuses.reduce((acc, r) => { acc[r._id] = r.count; return acc; }, {});
  const roleMap = roleCounts.reduce((acc, r) => { acc[r.key] = r.count; return acc; }, {});

  const [trend, topCategories, topResources, departmentUsage, dailyIssues] = await Promise.all([
    circulationTrend(6),
    Loan.aggregate([
      { $lookup: { from: 'resources', localField: 'resource', foreignField: '_id', as: 'res' } },
      { $unwind: '$res' },
      { $group: { _id: '$res.category', count: { $sum: 1 } } },
      { $lookup: { from: 'categories', localField: '_id', foreignField: '_id', as: 'cat' } },
      { $project: { name: { $ifNull: [{ $first: '$cat.name' }, 'Uncategorised'] }, count: 1 } },
      { $sort: { count: -1 } },
      { $limit: 8 },
    ]),
    Resource.find({ borrowCount: { $gt: 0 } })
      .sort('-borrowCount').limit(8)
      .select('title resourceType borrowCount availableCopies totalCopies').lean(),
    Loan.aggregate([
      { $lookup: { from: 'users', localField: 'user', foreignField: '_id', as: 'u' } },
      { $unwind: '$u' },
      { $group: { _id: '$u.department', count: { $sum: 1 } } },
      { $lookup: { from: 'departments', localField: '_id', foreignField: '_id', as: 'dept' } },
      { $project: { name: { $ifNull: [{ $first: '$dept.name' }, 'Unassigned'] }, count: 1 } },
      { $sort: { count: -1 } },
      { $limit: 8 },
    ]),
    Loan.aggregate([
      { $match: { borrowDate: { $gte: addDays(new Date(), -13) } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$borrowDate' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
  ]);

  return {
    cards: {
      totalResources,
      totalCopies,
      availableCopies: copyByStatus.available || 0,
      borrowedItems: copyByStatus.borrowed || 0,
      overdueItems: overdueCount,
      lostItems: copyByStatus.lost || 0,
      damagedItems: (copyByStatus.damaged || 0) + (copyByStatus.under_repair || 0),
      missingItems: copyByStatus.missing || 0,
      totalMembers,
      students: roleMap.student || 0,
      academicStaff: roleMap.lecturer || 0,
      librarians: roleMap.librarian || 0,
      outstandingFines: fineSummary.totalOutstanding,
      finesCollected: fineSummary.totalPaid,
      finesWaived: fineSummary.totalWaived,
      pendingClearance,
      digitalResources: digitalCount,
      activeReadingGroups: activeGroups,
      readingSessionsToday: groupsToday,
      reservationsPending,
      reservationsReady,
      activeLoans: (loanByStatus.active || 0) + (loanByStatus.overdue || 0),
    },
    charts: {
      circulationTrend: trend,
      dailyIssues: dailyIssues.map((d) => ({ date: d._id, count: d.count })),
      copyStatusDistribution: Object.entries(copyByStatus).map(([status, count]) => ({ status, count })),
      loanStatusDistribution: Object.entries(loanByStatus).map(([status, count]) => ({ status, count })),
      topCategories: topCategories.map((c) => ({ name: c.name, count: c.count })),
      departmentUsage: departmentUsage.map((d) => ({ name: d.name, count: d.count })),
      fineByType: fineSummary.byType,
    },
    lists: {
      mostBorrowed: topResources,
      recentlyAdded: await resourceService.recentlyAdded(5),
    },
  };
}

async function librarianDashboard(userId) {
  const todayStart = startOfDay();
  const todayEnd = endOfDay();

  const [
    issuedToday, returnedToday, overdueLoans, reservationsReady,
    pendingClearance, outstandingFines, sessionsToday, recentResources, overdueList,
  ] = await Promise.all([
    Loan.countDocuments({ borrowDate: { $gte: todayStart, $lte: todayEnd } }),
    Loan.countDocuments({ returnDate: { $gte: todayStart, $lte: todayEnd } }),
    Loan.countDocuments({ status: { $in: ['active', 'overdue'] }, dueDate: { $lt: new Date() } }),
    Reservation.countDocuments({ status: 'ready' }),
    Clearance.countDocuments({ status: { $in: ['pending', 'blocked'] } }),
    fineService.summary(),
    ReadingGroupSession.find({ startsAt: { $gte: todayStart, $lte: todayEnd } })
      .populate('group', 'name').populate('space', 'name').sort('startsAt').lean(),
    Resource.find().sort('-createdAt').limit(5).select('title resourceType createdAt totalCopies').lean(),
    Loan.find({ status: { $in: ['active', 'overdue'] }, dueDate: { $lt: new Date() } })
      .populate('user', 'firstName lastName registrationNumber')
      .populate('resource', 'title')
      .sort('dueDate')
      .limit(10)
      .lean(),
  ]);

  return {
    cards: {
      issuedToday,
      returnedToday,
      overdueLoans,
      reservationsReady,
      pendingClearance,
      outstandingFines: outstandingFines.totalOutstanding,
      readingSessionsToday: sessionsToday.length,
    },
    lists: {
      sessionsToday,
      recentlyAdded: recentResources,
      overdueLoans: overdueList,
    },
    charts: { circulationTrend: await circulationTrend(6) },
  };
}

async function memberDashboard(userId) {
  const settings = require('./settings.service');
  const { circulation } = await settings.getSettings();
  const dueSoonCutoff = addDays(new Date(), circulation.dueSoonReminderDays);

  const [activeLoans, dueSoon, overdue, reservations, outstanding, clearance, unread, recommendations] = await Promise.all([
    Loan.find({ user: userId, status: { $in: ['active', 'overdue'] } })
      .populate('resource', 'title resourceType coverImage')
      .populate('copy', 'accessionNumber')
      .sort('dueDate').lean(),
    Loan.countDocuments({
      user: userId,
      status: { $in: ['active', 'overdue'] },
      dueDate: { $gte: new Date(), $lte: dueSoonCutoff },
    }),
    Loan.countDocuments({ user: userId, status: { $in: ['active', 'overdue'] }, dueDate: { $lt: new Date() } }),
    Reservation.find({ user: userId, status: { $in: ['pending', 'ready'] } })
      .populate('resource', 'title coverImage').lean(),
    fineService.getOutstandingForUser(userId),
    Clearance.findOne({ user: userId }).sort('-createdAt').select('status clearanceCode certificateNumber blockingReasons').lean(),
    Notification.countDocuments({ user: userId, isRead: false }),
    // Recommend from the categories the member has actually borrowed from.
    Loan.aggregate([
      { $match: { user: oid(userId) } },
      { $lookup: { from: 'resources', localField: 'resource', foreignField: '_id', as: 'res' } },
      { $unwind: '$res' },
      { $group: { _id: '$res.category', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 2 },
    ]),
  ]);

  const categories = recommendations.map((r) => r._id).filter(Boolean);
  const recommended = categories.length
    ? await Resource.find({ category: { $in: categories }, availableCopies: { $gt: 0 } })
      .sort('-borrowCount').limit(6)
      .select('title resourceType coverImage availableCopies').lean()
    : await Resource.find({ availableCopies: { $gt: 0 } })
      .sort('-borrowCount').limit(6)
      .select('title resourceType coverImage availableCopies').lean();

  return {
    cards: {
      activeLoans: activeLoans.length,
      dueSoon,
      overdue,
      reservations: reservations.length,
      fineBalance: outstanding.total,
      unreadNotifications: unread,
      clearanceStatus: clearance?.status || 'not_requested',
    },
    lists: {
      loans: activeLoans,
      reservations,
      fines: outstanding.fines.slice(0, 5),
      recommended,
    },
    clearance,
  };
}

module.exports = { adminDashboard, librarianDashboard, memberDashboard, circulationTrend };
