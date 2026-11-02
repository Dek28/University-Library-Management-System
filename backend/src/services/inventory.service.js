const mongoose = require('mongoose');
const InventoryAudit = require('../models/InventoryAudit');
const ResourceCopy = require('../models/ResourceCopy');
const Loan = require('../models/Loan');
const ApiError = require('../utils/ApiError');
const auditService = require('./audit.service');
const resourceService = require('./resource.service');
const { buildPagination, paginate, compact } = require('../utils/query');
const { auditCode } = require('../utils/identifiers');

const POPULATE = [
  { path: 'shelf', select: 'name section rack' },
  { path: 'category', select: 'name' },
  { path: 'startedBy', select: 'firstName lastName' },
  { path: 'completedBy', select: 'firstName lastName' },
];

/** Copy-level stock counts, optionally narrowed to a shelf or category. */
async function stockSummary({ shelf, category } = {}) {
  const match = compact({ shelf });
  const pipeline = [];
  if (category) {
    pipeline.push(
      { $lookup: { from: 'resources', localField: 'resource', foreignField: '_id', as: 'res' } },
      { $unwind: '$res' },
      { $match: { 'res.category': category } },
    );
  }
  pipeline.unshift({ $match: { isDeleted: { $ne: true }, ...match } });
  pipeline.push({ $group: { _id: '$status', count: { $sum: 1 } } });

  const rows = await ResourceCopy.aggregate(pipeline);
  const byStatus = rows.reduce((acc, r) => { acc[r._id] = r.count; return acc; }, {});
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  return { total, byStatus };
}

async function listCopiesByStatus(status, query = {}) {
  const pagination = buildPagination(query, { defaultSort: 'accessionNumber', defaultLimit: 50 });
  const filter = compact({ status, shelf: query.shelf });
  const result = await paginate(ResourceCopy, filter, pagination, {
    populate: [
      { path: 'resource', select: 'title resourceType' },
      { path: 'shelf', select: 'name section rack' },
    ],
  });

  // The damaged and lost lists also say who had the copy and when it was recorded.
  if (['damaged', 'lost'].includes(status) && result.items.length) {
    const loans = await Loan.find({
      copy: { $in: result.items.map((copy) => copy.id) },
      status: { $in: ['damaged', 'lost'] },
    })
      .sort('-updatedAt')
      .populate({ path: 'user', select: 'firstName lastName registrationNumber employeeId' })
      .lean();

    const latest = new Map();
    loans.forEach((loan) => { if (!latest.has(String(loan.copy))) latest.set(String(loan.copy), loan); });

    result.items = result.items.map((copy) => {
      const loan = latest.get(String(copy.id));
      return {
        ...copy,
        lastLoan: loan ? {
          id: String(loan._id),
          transactionId: loan.transactionId,
          status: loan.status,
          recordedAt: loan.returnDate || loan.updatedAt,
          borrower: loan.user ? {
            id: String(loan.user._id),
            fullName: `${loan.user.firstName} ${loan.user.lastName}`.trim(),
            identifier: loan.user.registrationNumber || loan.user.employeeId || '',
          } : null,
        } : null,
      };
    });
  }

  return result;
}

async function listAudits(query = {}) {
  const pagination = buildPagination(query, { defaultSort: '-createdAt' });
  const filter = compact({ status: query.status, shelf: query.shelf });
  return paginate(InventoryAudit, filter, pagination, { populate: POPULATE, select: '-items' });
}

async function getAudit(id) {
  const audit = await InventoryAudit.findById(id).populate([
    ...POPULATE,
    { path: 'items.copy', select: 'accessionNumber barcode resource status' },
  ]);
  if (!audit) throw ApiError.notFound('Inventory audit not found');
  return audit;
}

/** Opens a stock-verification exercise and snapshots the expected population. */
async function startAudit(payload, actor, context = {}) {
  const open = await InventoryAudit.findOne({ status: 'in_progress' });
  if (open) {
    throw ApiError.conflict(`Audit "${open.title}" is already in progress. Complete or cancel it first.`);
  }

  const scope = compact({ shelf: payload.shelf });
  const expectedCount = await ResourceCopy.countDocuments({
    ...scope,
    status: { $nin: ['withdrawn', 'lost'] },
  });

  const audit = await InventoryAudit.create({
    auditCode: auditCode(),
    title: payload.title,
    description: payload.description || '',
    shelf: payload.shelf || null,
    category: payload.category || null,
    startedBy: actor._id,
    expectedCount,
  });

  await auditService.record({
    ...context, actor, action: 'inventory_audit_started', entityType: 'InventoryAudit', entityId: audit._id,
    entityLabel: audit.auditCode, newValue: { title: audit.title, expectedCount },
  });
  return getAudit(audit._id);
}

/**
 * Records one scanned copy. Re-scanning the same copy replaces the earlier
 * entry so a corrected scan does not double-count.
 */
async function recordItem(auditId, { identifier, foundStatus, condition, remark }, actor) {
  const audit = await InventoryAudit.findById(auditId);
  if (!audit) throw ApiError.notFound('Inventory audit not found');
  if (audit.status !== 'in_progress') throw ApiError.badRequest('This audit is closed');

  const copy = await ResourceCopy.findOne({
    $or: [{ barcode: String(identifier).trim() }, { accessionNumber: String(identifier).toUpperCase().trim() }],
  });
  if (!copy) throw ApiError.notFound(`No copy found for "${identifier}"`);

  const entry = {
    _id: new mongoose.Types.ObjectId(),
    copy: copy._id,
    accessionNumber: copy.accessionNumber,
    expectedStatus: copy.status,
    foundStatus,
    condition: condition || copy.condition,
    remark: remark || '',
    verifiedBy: actor._id,
    verifiedAt: new Date(),
  };

  // One atomic pipeline update swaps the entry and recounts from the result, so
  // simultaneous scans from several devices cannot overwrite each other.
  const countOf = (status) => ({
    $size: { $filter: { input: '$items', cond: { $eq: ['$$this.foundStatus', status] } } },
  });
  const updated = await InventoryAudit.updateOne(
    { _id: auditId, status: 'in_progress' },
    [
      {
        $set: {
          items: {
            $concatArrays: [
              { $filter: { input: '$items', cond: { $ne: ['$$this.copy', entry.copy] } } },
              [{ $literal: entry }],
            ],
          },
        },
      },
      {
        $set: {
          verifiedCount: countOf('found'),
          missingCount: countOf('missing'),
          damagedCount: countOf('damaged'),
          misplacedCount: countOf('misplaced'),
        },
      },
    ],
  );
  if (!updated.matchedCount) throw ApiError.badRequest('This audit is closed');

  // Verification date on the copy itself supports "not seen since" reporting.
  copy.lastVerifiedAt = new Date();
  await copy.save();

  return { audit: await getAudit(auditId), copy };
}

/**
 * Closes an audit. When `applyAdjustments` is set, copies reported missing or
 * damaged have their status updated. Copies that are on loan or held for a
 * member are never touched, because their whereabouts are already accounted for.
 */
async function completeAudit(auditId, { applyAdjustments = true, notes }, actor, context = {}) {
  const audit = await InventoryAudit.findById(auditId);
  if (!audit) throw ApiError.notFound('Inventory audit not found');
  if (audit.status !== 'in_progress') throw ApiError.badRequest('This audit is already closed');

  const adjustments = [];
  if (applyAdjustments) {
    for (const item of audit.items) {
      const nextStatus = { missing: 'missing', damaged: 'damaged' }[item.foundStatus];
      if (!nextStatus) continue;

      // eslint-disable-next-line no-await-in-loop
      const copy = await ResourceCopy.findById(item.copy);
      if (!copy || ['borrowed', 'reserved'].includes(copy.status)) continue;

      const previous = copy.status;
      copy.status = nextStatus;
      if (item.condition) copy.condition = item.condition;
      // eslint-disable-next-line no-await-in-loop
      await copy.save();
      // eslint-disable-next-line no-await-in-loop
      await resourceService.syncAvailability(copy.resource);
      adjustments.push({ accessionNumber: copy.accessionNumber, from: previous, to: nextStatus });
    }
  }

  audit.status = 'completed';
  audit.completedAt = new Date();
  audit.completedBy = actor._id;
  audit.appliedAdjustments = applyAdjustments;
  audit.notes = notes || audit.notes;
  await audit.save();

  await auditService.record({
    ...context, actor, action: 'inventory_audit_completed', entityType: 'InventoryAudit', entityId: audit._id,
    entityLabel: audit.auditCode,
    newValue: {
      expected: audit.expectedCount,
      verified: audit.verifiedCount,
      missing: audit.missingCount,
      damaged: audit.damagedCount,
      adjustmentsApplied: adjustments.length,
    },
  });

  return { audit: await getAudit(auditId), adjustments };
}

async function cancelAudit(auditId, reason, actor, context = {}) {
  const audit = await InventoryAudit.findById(auditId);
  if (!audit) throw ApiError.notFound('Inventory audit not found');
  if (audit.status !== 'in_progress') throw ApiError.badRequest('This audit is already closed');

  audit.status = 'cancelled';
  audit.completedAt = new Date();
  audit.completedBy = actor._id;
  audit.notes = `${audit.notes} | Cancelled: ${reason || 'no reason given'}`.trim();
  await audit.save();

  await auditService.record({
    ...context, actor, action: 'inventory_audit_completed', entityType: 'InventoryAudit', entityId: audit._id,
    entityLabel: audit.auditCode, description: `Cancelled: ${reason || ''}`,
  });
  return getAudit(auditId);
}

/** Direct status change on a single copy, outside a formal audit. */
async function adjustCopy(copyId, { status, condition, reason }, actor, context = {}) {
  const copy = await ResourceCopy.findById(copyId);
  if (!copy) throw ApiError.notFound('Copy not found');
  if (copy.status === 'borrowed') {
    throw ApiError.conflict('This copy is on loan. Use the returns desk to record a loss or damage.');
  }
  if (copy.status === 'reserved') {
    throw ApiError.conflict('This copy is being held for a member. Cancel the reservation first.');
  }

  const before = { status: copy.status, condition: copy.condition };
  const repaired = require('./copy.service').resolveRepair(copy, { status, condition });
  copy.status = repaired.status;
  if (repaired.condition) copy.condition = repaired.condition;
  copy.notes = reason ? `${copy.notes} | ${reason}`.trim() : copy.notes;
  copy.updatedBy = actor._id;
  await copy.save();
  await resourceService.syncAvailability(copy.resource);

  await auditService.record({
    ...context, actor, action: 'inventory_adjusted', entityType: 'ResourceCopy', entityId: copy._id,
    entityLabel: copy.accessionNumber, oldValue: before, newValue: { status, condition, reason },
  });
  return copy;
}

module.exports = {
  stockSummary, listCopiesByStatus, listAudits, getAudit,
  startAudit, recordItem, completeAudit, cancelAudit, adjustCopy,
};
