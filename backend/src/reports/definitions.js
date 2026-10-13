/**
 * Report registry.
 *
 * Each definition declares its columns once and a loader that returns plain
 * rows. The controller then renders the same rows as JSON, XLSX, CSV or PDF,
 * so a new report needs no new endpoint, no new export code and no new route.
 */
const Loan = require('../models/Loan');
const Renewal = require('../models/Renewal');
const Reservation = require('../models/Reservation');
const Resource = require('../models/Resource');
const ResourceCopy = require('../models/ResourceCopy');
const { Shelf } = require('../models/reference');
const Fine = require('../models/Fine');
const FinePayment = require('../models/FinePayment');
const User = require('../models/User');
const Clearance = require('../models/Clearance');
const { ReadingGroup, ReadingGroupSession, ReadingGroupAttendance } = require('../models/readingGroup');
const { dateRange, compact, like } = require('../utils/query');
const { startOfDay, endOfDay } = require('../utils/datetime');

const MAX_ROWS = 10000;

const dateOnly = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');
const money = (v) => Number(Number(v || 0).toFixed(2));
const personName = (u) => (u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() : '');
const identifier = (u) => u?.registrationNumber || u?.employeeId || '';

const LOAN_COLUMNS = [
  { header: 'Transaction', key: 'transactionId', width: 1.8 },
  { header: 'Member', key: 'member', width: 2.2 },
  { header: 'Identifier', key: 'identifier', width: 1.5 },
  { header: 'Title', key: 'title', width: 3 },
  { header: 'Accession', key: 'accession', width: 1.5 },
  { header: 'Borrowed', key: 'borrowDate', width: 1.2 },
  { header: 'Due', key: 'dueDate', width: 1.2 },
  { header: 'Returned', key: 'returnDate', width: 1.2 },
  { header: 'Days overdue', key: 'daysOverdue', width: 1.1, align: 'right' },
  { header: 'Status', key: 'status', width: 1 },
  { header: 'Fine', key: 'fineAmount', width: 1, type: 'money', align: 'right' },
];

const loanRow = (l) => ({
  transactionId: l.transactionId,
  member: personName(l.user),
  identifier: identifier(l.user),
  title: l.resource?.title || '',
  accession: l.copy?.accessionNumber || '',
  borrowDate: dateOnly(l.borrowDate),
  dueDate: dateOnly(l.dueDate),
  returnDate: dateOnly(l.returnDate),
  daysOverdue: l.daysOverdue || 0,
  status: l.status,
  fineAmount: money(l.fineAmount),
});

const loadLoans = (filter) =>
  Loan.find(filter)
    .populate('user', 'firstName lastName registrationNumber employeeId')
    .populate('resource', 'title resourceType')
    .populate('copy', 'accessionNumber barcode')
    .sort('-borrowDate')
    .limit(MAX_ROWS)
    .lean();

const COPY_COLUMNS = [
  { header: 'Accession', key: 'accession', width: 1.6 },
  { header: 'Barcode', key: 'barcode', width: 1.6 },
  { header: 'Title', key: 'title', width: 3.2 },
  { header: 'Type', key: 'resourceType', width: 1.2 },
  { header: 'Shelf', key: 'shelf', width: 1.4 },
  { header: 'Status', key: 'status', width: 1.1 },
  { header: 'Condition', key: 'condition', width: 1.2 },
  { header: 'Times borrowed', key: 'borrowCount', width: 1.2, align: 'right' },
];

const copyRow = (c) => ({
  accession: c.accessionNumber,
  barcode: c.barcode,
  title: c.resource?.title || '',
  resourceType: c.resource?.resourceType || '',
  shelf: Shelf.labelOf(c.shelf),
  status: c.status,
  condition: c.condition,
  borrowCount: c.borrowCount || 0,
});

const loadCopies = (filter) =>
  ResourceCopy.find(filter)
    .populate('resource', 'title resourceType')
    .populate('shelf', 'name section rack')
    .sort('accessionNumber')
    .limit(MAX_ROWS)
    .lean();

const definitions = {
  // ---------------------------------------------------------------- Circulation
  'circulation-issued': {
    title: 'Items Issued',
    group: 'circulation',
    columns: LOAN_COLUMNS,
    async load(query) {
      const range = dateRange(query.from, query.to) || { $gte: startOfDay(), $lte: endOfDay() };
      return (await loadLoans({ borrowDate: range })).map(loanRow);
    },
  },
  'circulation-returned': {
    title: 'Items Returned',
    group: 'circulation',
    columns: LOAN_COLUMNS,
    async load(query) {
      const range = dateRange(query.from, query.to) || { $gte: startOfDay(), $lte: endOfDay() };
      return (await loadLoans({ returnDate: range })).map(loanRow);
    },
  },
  'circulation-active': {
    title: 'Current Loans',
    group: 'circulation',
    columns: LOAN_COLUMNS,
    load: async () => (await loadLoans({ status: { $in: ['active', 'overdue'] } })).map(loanRow),
  },
  'circulation-overdue': {
    title: 'Overdue Loans',
    group: 'circulation',
    columns: LOAN_COLUMNS,
    load: async () =>
      (await loadLoans({ status: { $in: ['active', 'overdue'] }, dueDate: { $lt: new Date() } })).map(loanRow),
  },
  'circulation-history': {
    title: 'Borrowing History',
    group: 'circulation',
    columns: LOAN_COLUMNS,
    async load(query) {
      const filter = compact({ user: query.user, resource: query.resource });
      const range = dateRange(query.from, query.to);
      if (range) filter.borrowDate = range;
      return (await loadLoans(filter)).map(loanRow);
    },
  },
  'circulation-renewals': {
    title: 'Renewals',
    group: 'circulation',
    columns: [
      { header: 'Member', key: 'member', width: 2.2 },
      { header: 'Identifier', key: 'identifier', width: 1.5 },
      { header: 'Loan', key: 'loan', width: 1.8 },
      { header: 'Renewal #', key: 'renewalNumber', width: 1, align: 'right' },
      { header: 'Previous due', key: 'previousDueDate', width: 1.3 },
      { header: 'New due', key: 'newDueDate', width: 1.3 },
      { header: 'Channel', key: 'channel', width: 1.2 },
      { header: 'Renewed by', key: 'renewedBy', width: 2 },
      { header: 'Date', key: 'createdAt', width: 1.3 },
    ],
    async load(query) {
      const filter = {};
      const range = dateRange(query.from, query.to);
      if (range) filter.createdAt = range;
      const rows = await Renewal.find(filter)
        .populate('user', 'firstName lastName registrationNumber employeeId')
        .populate('loan', 'transactionId')
        .populate('renewedBy', 'firstName lastName')
        .sort('-createdAt').limit(MAX_ROWS).lean();
      return rows.map((r) => ({
        member: personName(r.user),
        identifier: identifier(r.user),
        loan: r.loan?.transactionId || '',
        renewalNumber: r.renewalNumber,
        previousDueDate: dateOnly(r.previousDueDate),
        newDueDate: dateOnly(r.newDueDate),
        channel: r.channel,
        renewedBy: personName(r.renewedBy),
        createdAt: dateOnly(r.createdAt),
      }));
    },
  },
  'circulation-reservations': {
    title: 'Reservations',
    group: 'circulation',
    columns: [
      { header: 'Code', key: 'reservationCode', width: 1.8 },
      { header: 'Member', key: 'member', width: 2.2 },
      { header: 'Identifier', key: 'identifier', width: 1.5 },
      { header: 'Title', key: 'title', width: 3 },
      { header: 'Status', key: 'status', width: 1.2 },
      { header: 'Reserved', key: 'reservedAt', width: 1.3 },
      { header: 'Ready', key: 'readyAt', width: 1.3 },
      { header: 'Expires', key: 'expiresAt', width: 1.3 },
    ],
    async load(query) {
      const filter = compact({ status: query.status });
      const range = dateRange(query.from, query.to);
      if (range) filter.createdAt = range;
      const rows = await Reservation.find(filter)
        .populate('user', 'firstName lastName registrationNumber employeeId')
        .populate('resource', 'title')
        .sort('-createdAt').limit(MAX_ROWS).lean();
      return rows.map((r) => ({
        reservationCode: r.reservationCode,
        member: personName(r.user),
        identifier: identifier(r.user),
        title: r.resource?.title || '',
        status: r.status,
        reservedAt: dateOnly(r.reservedAt),
        readyAt: dateOnly(r.readyAt),
        expiresAt: dateOnly(r.expiresAt),
      }));
    },
  },

  // ------------------------------------------------------------------ Resources
  'resources-available': {
    title: 'Available Copies',
    group: 'resources',
    columns: COPY_COLUMNS,
    load: async () => (await loadCopies({ status: 'available' })).map(copyRow),
  },
  'resources-borrowed': {
    title: 'Borrowed Copies',
    group: 'resources',
    columns: COPY_COLUMNS,
    load: async () => (await loadCopies({ status: 'borrowed' })).map(copyRow),
  },
  'resources-lost': {
    title: 'Lost Copies',
    group: 'resources',
    columns: COPY_COLUMNS,
    load: async () => (await loadCopies({ status: 'lost' })).map(copyRow),
  },
  'resources-damaged': {
    title: 'Damaged Copies',
    group: 'resources',
    columns: COPY_COLUMNS,
    load: async () => (await loadCopies({ status: { $in: ['damaged', 'under_repair'] } })).map(copyRow),
  },
  'resources-missing': {
    title: 'Missing Copies',
    group: 'resources',
    columns: COPY_COLUMNS,
    load: async () => (await loadCopies({ status: 'missing' })).map(copyRow),
  },
  'resources-withdrawn': {
    title: 'Withdrawn Copies',
    group: 'resources',
    columns: COPY_COLUMNS,
    load: async () => (await loadCopies({ status: 'withdrawn' })).map(copyRow),
  },
  'resources-most-borrowed': {
    title: 'Most Borrowed Titles',
    group: 'resources',
    columns: [
      { header: 'Title', key: 'title', width: 3.5 },
      { header: 'Type', key: 'resourceType', width: 1.2 },
      { header: 'Category', key: 'category', width: 1.8 },
      { header: 'Times borrowed', key: 'borrowCount', width: 1.3, align: 'right' },
      { header: 'Copies', key: 'totalCopies', width: 1, align: 'right' },
      { header: 'Available', key: 'availableCopies', width: 1, align: 'right' },
    ],
    async load() {
      const rows = await Resource.find({ borrowCount: { $gt: 0 } })
        .populate('category', 'name')
        .sort('-borrowCount').limit(200).lean();
      return rows.map((r) => ({
        title: r.title,
        resourceType: r.resourceType,
        category: r.category?.name || '',
        borrowCount: r.borrowCount,
        totalCopies: r.totalCopies,
        availableCopies: r.availableCopies,
      }));
    },
  },
  'resources-least-used': {
    title: 'Least Used Titles',
    group: 'resources',
    columns: [
      { header: 'Title', key: 'title', width: 3.5 },
      { header: 'Type', key: 'resourceType', width: 1.2 },
      { header: 'Category', key: 'category', width: 1.8 },
      { header: 'Times borrowed', key: 'borrowCount', width: 1.3, align: 'right' },
      { header: 'Added', key: 'createdAt', width: 1.3 },
    ],
    async load() {
      const rows = await Resource.find({ totalCopies: { $gt: 0 } })
        .populate('category', 'name')
        .sort('borrowCount createdAt').limit(200).lean();
      return rows.map((r) => ({
        title: r.title,
        resourceType: r.resourceType,
        category: r.category?.name || '',
        borrowCount: r.borrowCount,
        createdAt: dateOnly(r.createdAt),
      }));
    },
  },
  'resources-by-department': {
    title: 'Titles by Department',
    group: 'resources',
    columns: [
      { header: 'Department', key: 'department', width: 3 },
      { header: 'Titles', key: 'titles', width: 1.2, align: 'right' },
      { header: 'Copies', key: 'copies', width: 1.2, align: 'right' },
      { header: 'Times borrowed', key: 'borrowCount', width: 1.4, align: 'right' },
    ],
    async load() {
      const rows = await Resource.aggregate([
        { $match: { isDeleted: { $ne: true } } },
        {
          $group: {
            _id: '$department',
            titles: { $sum: 1 },
            copies: { $sum: '$totalCopies' },
            borrowCount: { $sum: '$borrowCount' },
          },
        },
        { $lookup: { from: 'departments', localField: '_id', foreignField: '_id', as: 'dept' } },
        { $project: { department: { $ifNull: [{ $first: '$dept.name' }, 'Unassigned'] }, titles: 1, copies: 1, borrowCount: 1 } },
        { $sort: { titles: -1 } },
      ]);
      return rows;
    },
  },
  'resources-by-category': {
    title: 'Titles by Category',
    group: 'resources',
    columns: [
      { header: 'Category', key: 'category', width: 3 },
      { header: 'Titles', key: 'titles', width: 1.2, align: 'right' },
      { header: 'Copies', key: 'copies', width: 1.2, align: 'right' },
      { header: 'Times borrowed', key: 'borrowCount', width: 1.4, align: 'right' },
    ],
    async load() {
      return Resource.aggregate([
        { $match: { isDeleted: { $ne: true } } },
        {
          $group: {
            _id: '$category',
            titles: { $sum: 1 },
            copies: { $sum: '$totalCopies' },
            borrowCount: { $sum: '$borrowCount' },
          },
        },
        { $lookup: { from: 'categories', localField: '_id', foreignField: '_id', as: 'cat' } },
        { $project: { category: { $ifNull: [{ $first: '$cat.name' }, 'Uncategorised'] }, titles: 1, copies: 1, borrowCount: 1 } },
        { $sort: { titles: -1 } },
      ]);
    },
  },
  'resources-by-author': {
    title: 'Titles by Author',
    group: 'resources',
    columns: [
      { header: 'Author', key: 'author', width: 3 },
      { header: 'Titles', key: 'titles', width: 1.2, align: 'right' },
      { header: 'Times borrowed', key: 'borrowCount', width: 1.4, align: 'right' },
    ],
    async load() {
      return Resource.aggregate([
        { $match: { isDeleted: { $ne: true } } },
        { $unwind: '$authors' },
        { $group: { _id: '$authors', titles: { $sum: 1 }, borrowCount: { $sum: '$borrowCount' } } },
        { $lookup: { from: 'authors', localField: '_id', foreignField: '_id', as: 'a' } },
        { $project: { author: { $ifNull: [{ $first: '$a.fullName' }, 'Unknown'] }, titles: 1, borrowCount: 1 } },
        { $sort: { titles: -1 } },
        { $limit: 300 },
      ]);
    },
  },

  // ---------------------------------------------------------------------- Users
  'users-active': {
    title: 'Active Members',
    group: 'users',
    columns: [
      { header: 'Identifier', key: 'identifier', width: 1.8 },
      { header: 'Name', key: 'name', width: 2.5 },
      { header: 'Email', key: 'email', width: 3 },
      { header: 'Role', key: 'role', width: 1.4 },
      { header: 'Department', key: 'department', width: 2 },
      { header: 'Active loans', key: 'activeLoans', width: 1.2, align: 'right' },
      { header: 'Fines', key: 'fines', width: 1.2, type: 'money', align: 'right' },
      { header: 'Last login', key: 'lastLoginAt', width: 1.4 },
    ],
    async load(query) {
      const filter = compact({ status: query.status || 'active', department: query.department });
      if (query.search) filter.$or = [{ firstName: like(query.search) }, { lastName: like(query.search) }, { email: like(query.search) }];
      const rows = await User.find(filter)
        .populate('role', 'name').populate('department', 'name')
        .sort('lastName').limit(MAX_ROWS).lean();
      return rows.map((u) => ({
        identifier: identifier(u),
        name: personName(u),
        email: u.email,
        role: u.role?.name || '',
        department: u.department?.name || '',
        activeLoans: u.activeLoanCount || 0,
        fines: money(u.outstandingFineTotal),
        lastLoginAt: dateOnly(u.lastLoginAt),
      }));
    },
  },
  'users-suspended': {
    title: 'Suspended and Inactive Members',
    group: 'users',
    columns: [
      { header: 'Identifier', key: 'identifier', width: 1.8 },
      { header: 'Name', key: 'name', width: 2.5 },
      { header: 'Email', key: 'email', width: 3 },
      { header: 'Status', key: 'status', width: 1.3 },
      { header: 'Reason', key: 'reason', width: 3 },
    ],
    async load() {
      const rows = await User.find({ status: { $in: ['suspended', 'inactive'] } }).sort('lastName').limit(MAX_ROWS).lean();
      return rows.map((u) => ({
        identifier: identifier(u), name: personName(u), email: u.email, status: u.status, reason: u.statusReason || '',
      }));
    },
  },
  'users-with-overdue': {
    title: 'Members with Overdue Items',
    group: 'users',
    columns: [
      { header: 'Identifier', key: 'identifier', width: 1.8 },
      { header: 'Name', key: 'name', width: 2.5 },
      { header: 'Email', key: 'email', width: 2.8 },
      { header: 'Overdue items', key: 'overdue', width: 1.3, align: 'right' },
      { header: 'Longest overdue (days)', key: 'maxDays', width: 1.8, align: 'right' },
    ],
    async load() {
      const rows = await Loan.aggregate([
        { $match: { status: { $in: ['active', 'overdue'] }, dueDate: { $lt: new Date() } } },
        {
          $group: {
            _id: '$user',
            overdue: { $sum: 1 },
            oldestDue: { $min: '$dueDate' },
          },
        },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'u' } },
        { $unwind: '$u' },
        { $sort: { overdue: -1 } },
        { $limit: MAX_ROWS },
      ]);
      const now = Date.now();
      return rows.map((r) => ({
        identifier: identifier(r.u),
        name: personName(r.u),
        email: r.u.email,
        overdue: r.overdue,
        maxDays: Math.floor((now - new Date(r.oldestDue).getTime()) / 86400000),
      }));
    },
  },
  'users-most-active': {
    title: 'Most Active Borrowers',
    group: 'users',
    columns: [
      { header: 'Identifier', key: 'identifier', width: 1.8 },
      { header: 'Name', key: 'name', width: 2.5 },
      { header: 'Department', key: 'department', width: 2 },
      { header: 'Loans', key: 'loans', width: 1.2, align: 'right' },
    ],
    async load(query) {
      const range = dateRange(query.from, query.to);
      const rows = await Loan.aggregate([
        ...(range ? [{ $match: { borrowDate: range } }] : []),
        { $group: { _id: '$user', loans: { $sum: 1 } } },
        { $sort: { loans: -1 } },
        { $limit: 200 },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'u' } },
        { $unwind: '$u' },
        { $lookup: { from: 'departments', localField: 'u.department', foreignField: '_id', as: 'd' } },
      ]);
      return rows.map((r) => ({
        identifier: identifier(r.u),
        name: personName(r.u),
        department: r.d?.[0]?.name || '',
        loans: r.loans,
      }));
    },
  },

  // -------------------------------------------------------------------- Finance
  'fines-outstanding': {
    title: 'Outstanding Fines',
    group: 'fines',
    columns: [
      { header: 'Fine code', key: 'fineCode', width: 1.8 },
      { header: 'Member', key: 'member', width: 2.2 },
      { header: 'Identifier', key: 'identifier', width: 1.5 },
      { header: 'Type', key: 'fineType', width: 1.2 },
      { header: 'Amount', key: 'amount', width: 1, type: 'money', align: 'right' },
      { header: 'Paid', key: 'paid', width: 1, type: 'money', align: 'right' },
      { header: 'Balance', key: 'balance', width: 1, type: 'money', align: 'right' },
      { header: 'Raised', key: 'createdAt', width: 1.3 },
    ],
    async load(query) {
      const filter = { status: { $in: ['outstanding', 'partially_paid'] } };
      const range = dateRange(query.from, query.to);
      if (range) filter.createdAt = range;
      const rows = await Fine.find(filter)
        .populate('user', 'firstName lastName registrationNumber employeeId')
        .sort('-createdAt').limit(MAX_ROWS).lean();
      return rows.map((f) => ({
        fineCode: f.fineCode,
        member: personName(f.user),
        identifier: identifier(f.user),
        fineType: f.fineType,
        amount: money(f.amount),
        paid: money(f.amountPaid),
        balance: money(f.amount - f.amountPaid - f.amountWaived),
        createdAt: dateOnly(f.createdAt),
      }));
    },
  },
  'fines-collected': {
    title: 'Fine Collection',
    group: 'fines',
    columns: [
      { header: 'Receipt', key: 'receiptNumber', width: 1.8 },
      { header: 'Member', key: 'member', width: 2.2 },
      { header: 'Fine', key: 'fine', width: 1.6 },
      { header: 'Kind', key: 'kind', width: 1.1 },
      { header: 'Method', key: 'method', width: 1.2 },
      { header: 'Amount', key: 'amount', width: 1.1, type: 'money', align: 'right' },
      { header: 'Processed by', key: 'processedBy', width: 2 },
      { header: 'Date', key: 'paidAt', width: 1.3 },
    ],
    async load(query) {
      const filter = compact({ kind: query.kind });
      const range = dateRange(query.from, query.to);
      if (range) filter.paidAt = range;
      const rows = await FinePayment.find(filter)
        .populate('user', 'firstName lastName registrationNumber employeeId')
        .populate('fine', 'fineCode fineType')
        .populate('processedBy', 'firstName lastName')
        .sort('-paidAt').limit(MAX_ROWS).lean();
      return rows.map((p) => ({
        receiptNumber: p.receiptNumber,
        member: personName(p.user),
        fine: p.fine?.fineCode || '',
        kind: p.kind,
        method: p.method,
        amount: money(p.amount),
        processedBy: personName(p.processedBy),
        paidAt: dateOnly(p.paidAt),
      }));
    },
  },
  'fines-waived': {
    title: 'Waived Fines',
    group: 'fines',
    columns: [
      { header: 'Fine code', key: 'fineCode', width: 1.8 },
      { header: 'Member', key: 'member', width: 2.2 },
      { header: 'Type', key: 'fineType', width: 1.2 },
      { header: 'Amount waived', key: 'waived', width: 1.3, type: 'money', align: 'right' },
      { header: 'Reason', key: 'reason', width: 3 },
      { header: 'Date', key: 'updatedAt', width: 1.3 },
    ],
    async load(query) {
      const filter = { amountWaived: { $gt: 0 } };
      const range = dateRange(query.from, query.to);
      if (range) filter.updatedAt = range;
      const rows = await Fine.find(filter)
        .populate('user', 'firstName lastName registrationNumber employeeId')
        .sort('-updatedAt').limit(MAX_ROWS).lean();
      return rows.map((f) => ({
        fineCode: f.fineCode,
        member: personName(f.user),
        fineType: f.fineType,
        waived: money(f.amountWaived),
        reason: f.waiveReason || '',
        updatedAt: dateOnly(f.updatedAt),
      }));
    },
  },

  // ------------------------------------------------------------------ Clearance
  'clearance-register': {
    title: 'Clearance Register',
    group: 'clearance',
    columns: [
      { header: 'Code', key: 'clearanceCode', width: 1.8 },
      { header: 'Member', key: 'member', width: 2.2 },
      { header: 'Identifier', key: 'identifier', width: 1.6 },
      { header: 'Department', key: 'department', width: 2 },
      { header: 'Status', key: 'status', width: 1.2 },
      { header: 'Items on loan', key: 'activeLoans', width: 1.2, align: 'right' },
      { header: 'Fines', key: 'fines', width: 1.2, type: 'money', align: 'right' },
      { header: 'Verified on', key: 'verifiedAt', width: 1.3 },
    ],
    async load(query) {
      const filter = compact({ status: query.status });
      const range = dateRange(query.from, query.to);
      if (range) filter.createdAt = range;
      const rows = await Clearance.find(filter)
        .populate({ path: 'user', select: 'firstName lastName registrationNumber employeeId department', populate: { path: 'department', select: 'name' } })
        .sort('-createdAt').limit(MAX_ROWS).lean();
      return rows.map((c) => ({
        clearanceCode: c.clearanceCode,
        member: personName(c.user),
        identifier: identifier(c.user),
        department: c.user?.department?.name || '',
        status: c.isOverride ? `${c.status} (override)` : c.status,
        activeLoans: c.obligations?.activeLoans || 0,
        fines: money(c.obligations?.outstandingFineTotal),
        verifiedAt: dateOnly(c.verifiedAt),
      }));
    },
  },

  // -------------------------------------------------------------- Reading groups
  'groups-sessions': {
    title: 'Reading Group Sessions',
    group: 'reading-groups',
    columns: [
      { header: 'Group', key: 'group', width: 2.4 },
      { header: 'Topic', key: 'topic', width: 2.6 },
      { header: 'Space', key: 'space', width: 1.8 },
      { header: 'Date', key: 'date', width: 1.3 },
      { header: 'From', key: 'startTime', width: 0.9 },
      { header: 'To', key: 'endTime', width: 0.9 },
      { header: 'Status', key: 'status', width: 1.1 },
      { header: 'Expected', key: 'expected', width: 1, align: 'right' },
    ],
    async load(query) {
      const filter = {};
      const range = dateRange(query.from, query.to);
      if (range) filter.startsAt = range;
      const rows = await ReadingGroupSession.find(filter)
        .populate('group', 'name readingTopic')
        .populate('space', 'name')
        .sort('-startsAt').limit(MAX_ROWS).lean();
      return rows.map((s) => ({
        group: s.group?.name || '',
        topic: s.topic || s.group?.readingTopic || '',
        space: s.space?.name || '',
        date: dateOnly(s.sessionDate),
        startTime: s.startTime,
        endTime: s.endTime,
        status: s.status,
        expected: s.expectedAttendees || 0,
      }));
    },
  },
  'groups-attendance': {
    title: 'Reading Group Attendance',
    group: 'reading-groups',
    columns: [
      { header: 'Group', key: 'group', width: 2.4 },
      { header: 'Member', key: 'member', width: 2.4 },
      { header: 'Identifier', key: 'identifier', width: 1.6 },
      { header: 'Status', key: 'status', width: 1.1 },
      { header: 'Recorded', key: 'recordedAt', width: 1.3 },
      { header: 'Remark', key: 'remark', width: 2.5 },
    ],
    async load(query) {
      const filter = compact({ group: query.group });
      const range = dateRange(query.from, query.to);
      if (range) filter.recordedAt = range;
      const rows = await ReadingGroupAttendance.find(filter)
        .populate('group', 'name')
        .populate('user', 'firstName lastName registrationNumber employeeId')
        .sort('-recordedAt').limit(MAX_ROWS).lean();
      return rows.map((a) => ({
        group: a.group?.name || '',
        member: personName(a.user),
        identifier: identifier(a.user),
        status: a.status,
        recordedAt: dateOnly(a.recordedAt),
        remark: a.remark || '',
      }));
    },
  },
  'groups-by-department': {
    title: 'Reading Groups by Department',
    group: 'reading-groups',
    columns: [
      { header: 'Department', key: 'department', width: 3 },
      { header: 'Groups', key: 'groups', width: 1.2, align: 'right' },
      { header: 'Members', key: 'members', width: 1.2, align: 'right' },
    ],
    async load() {
      return ReadingGroup.aggregate([
        { $match: { isDeleted: { $ne: true } } },
        { $group: { _id: '$department', groups: { $sum: 1 }, members: { $sum: { $size: '$members' } } } },
        { $lookup: { from: 'departments', localField: '_id', foreignField: '_id', as: 'd' } },
        { $project: { department: { $ifNull: [{ $first: '$d.name' }, 'Unassigned'] }, groups: 1, members: 1 } },
        { $sort: { groups: -1 } },
      ]);
    },
  },
  'groups-space-usage': {
    title: 'Study Space Usage',
    group: 'reading-groups',
    columns: [
      { header: 'Space', key: 'space', width: 3 },
      { header: 'Sessions', key: 'sessions', width: 1.2, align: 'right' },
      { header: 'Hours booked', key: 'hours', width: 1.4, align: 'right' },
    ],
    async load(query) {
      const range = dateRange(query.from, query.to);
      return ReadingGroupSession.aggregate([
        ...(range ? [{ $match: { startsAt: range } }] : []),
        {
          $group: {
            _id: '$space',
            sessions: { $sum: 1 },
            minutes: { $sum: { $divide: [{ $subtract: ['$endsAt', '$startsAt'] }, 60000] } },
          },
        },
        { $lookup: { from: 'studyspaces', localField: '_id', foreignField: '_id', as: 's' } },
        {
          $project: {
            space: { $ifNull: [{ $first: '$s.name' }, 'Unknown'] },
            sessions: 1,
            hours: { $round: [{ $divide: ['$minutes', 60] }, 1] },
          },
        },
        { $sort: { sessions: -1 } },
      ]);
    },
  },
};

const catalogue = () =>
  Object.entries(definitions).map(([key, def]) => ({ key, title: def.title, group: def.group }));

module.exports = { definitions, catalogue, MAX_ROWS };
