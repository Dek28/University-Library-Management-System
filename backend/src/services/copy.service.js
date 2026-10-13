const ResourceCopy = require('../models/ResourceCopy');
const Resource = require('../models/Resource');
const Loan = require('../models/Loan');
const ApiError = require('../utils/ApiError');
const auditService = require('./audit.service');
const resourceService = require('./resource.service');
const { buildPagination, paginate, compact, like } = require('../utils/query');
const { generateBarcode } = require('../utils/identifiers');
const { nextAccessionNumbers } = require('./sequence.service');

const POPULATE = [
  { path: 'resource', select: 'title resourceType isbn' },
  { path: 'shelf', select: 'name section rack' },
];

async function list(query = {}, options = {}) {
  const pagination = buildPagination(query, { defaultSort: 'accessionNumber', defaultLimit: 50, ...options });
  const filter = compact({
    resource: query.resource,
    status: query.status,
    condition: query.condition,
    shelf: query.shelf,
  });
  if (query.search) {
    filter.$or = [
      { accessionNumber: like(query.search) },
      { barcode: like(query.search) },
      { notes: like(query.search) },
    ];
  }
  return paginate(ResourceCopy, filter, pagination, { populate: POPULATE });
}

async function getById(id) {
  const copy = await ResourceCopy.findById(id).populate(POPULATE);
  if (!copy) throw ApiError.notFound('Copy not found');
  return copy;
}

/** Resolves a scanned barcode or typed accession number to a copy. */
async function findByIdentifier(identifier) {
  const value = String(identifier || '').trim();
  if (!value) throw ApiError.badRequest('A barcode or accession number is required');

  const copy = await ResourceCopy.findOne({
    $or: [{ barcode: value }, { accessionNumber: value.toUpperCase() }],
  }).populate([
    { path: 'resource', select: 'title subtitle resourceType isbn isBorrowable isReferenceOnly replacementCost' },
    { path: 'shelf', select: 'name section rack' },
    { path: 'currentLoan', select: 'transactionId user dueDate status' },
  ]);

  if (!copy) throw ApiError.notFound(`No copy found for "${identifier}"`);
  return copy;
}

/** The next library-wide accession number, e.g. 001251. */
async function nextAccessionNumber() {
  const [number] = await nextAccessionNumbers(1);
  return number;
}

async function create(payload, actor, context = {}) {
  const resource = await Resource.findById(payload.resource);
  if (!resource) throw ApiError.badRequest('The catalogue record does not exist');

  const copy = await ResourceCopy.create({
    ...payload,
    accessionNumber: payload.accessionNumber || (await nextAccessionNumber()),
    barcode: payload.barcode || generateBarcode('20'),
    replacementCost: payload.replacementCost || resource.replacementCost || 0,
    createdBy: actor?._id,
    updatedBy: actor?._id,
  });

  await resourceService.syncAvailability(resource._id);
  await auditService.record({
    ...context, actor, action: 'copy_created', entityType: 'ResourceCopy', entityId: copy._id,
    entityLabel: copy.accessionNumber, newValue: copy.toObject(),
  });
  return getById(copy._id);
}

/** Adds several copies of one title in a single call. */
async function createBatch({ resource: resourceId, quantity, ...shared }, actor, context = {}) {
  const resource = await Resource.findById(resourceId);
  if (!resource) throw ApiError.badRequest('The catalogue record does not exist');

  const accessionNumbers = await nextAccessionNumbers(quantity);

  const docs = Array.from({ length: quantity }, (unused, index) => ({
    ...shared,
    resource: resourceId,
    accessionNumber: accessionNumbers[index],
    barcode: generateBarcode('20'),
    replacementCost: shared.replacementCost || resource.replacementCost || 0,
    createdBy: actor?._id,
    updatedBy: actor?._id,
  }));

  const copies = await ResourceCopy.insertMany(docs);
  await resourceService.syncAvailability(resourceId);

  await auditService.record({
    ...context, actor, action: 'copy_created', entityType: 'ResourceCopy', entityId: resource._id,
    entityLabel: resource.title, description: `${copies.length} copies added`,
  });
  return copies;
}

const MANUAL_STATUSES = ['available', 'damaged', 'lost', 'missing', 'withdrawn', 'under_repair', 'reference_only'];

async function update(id, payload, actor, context = {}) {
  const copy = await ResourceCopy.findById(id);
  if (!copy) throw ApiError.notFound('Copy not found');
  const before = copy.toObject();

  // `borrowed`/`reserved` are owned by circulation, not by manual edits.
  if (payload.status && !MANUAL_STATUSES.includes(payload.status)) {
    throw ApiError.badRequest(`Status "${payload.status}" is set by circulation, not manually`);
  }
  if (payload.status && payload.status !== copy.status && copy.status === 'borrowed') {
    throw ApiError.conflict('This copy is on loan. Process the return before changing its status.');
  }

  copy.set({ ...payload, updatedBy: actor?._id });
  await copy.save();
  await resourceService.syncAvailability(copy.resource);

  await auditService.record({
    ...context, actor, action: 'copy_updated', entityType: 'ResourceCopy', entityId: copy._id,
    entityLabel: copy.accessionNumber, oldValue: before, newValue: copy.toObject(),
  });
  return getById(id);
}

async function remove(id, actor, context = {}) {
  const copy = await ResourceCopy.findById(id);
  if (!copy) throw ApiError.notFound('Copy not found');

  const openLoan = await Loan.exists({ copy: copy._id, status: { $in: ['active', 'overdue'] } });
  if (openLoan) throw ApiError.conflict('This copy is on loan and cannot be deleted.');

  const historic = await Loan.countDocuments({ copy: copy._id });
  if (historic > 0) {
    // Keep circulation history resolvable: withdraw rather than erase.
    copy.status = 'withdrawn';
    copy.updatedBy = actor?._id;
    await copy.save();
  } else {
    await copy.softDelete(actor?._id);
  }

  await resourceService.syncAvailability(copy.resource);
  await auditService.record({
    ...context, actor, action: 'copy_deleted', entityType: 'ResourceCopy', entityId: copy._id,
    entityLabel: copy.accessionNumber,
    description: historic > 0 ? 'Withdrawn (loan history preserved)' : 'Deleted',
  });
  return true;
}

module.exports = { list, getById, findByIdentifier, create, createBatch, update, remove, nextAccessionNumber };
