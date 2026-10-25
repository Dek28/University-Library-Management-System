const PurchaseOrder = require('../models/PurchaseOrder');
const Resource = require('../models/Resource');
const { Author, Shelf } = require('../models/reference');
const ApiError = require('../utils/ApiError');
const auditService = require('./audit.service');
const copyService = require('./copy.service');
const { buildPagination, paginate, compact, like } = require('../utils/query');
const { orderCode, invoiceCode } = require('../utils/identifiers');

const POPULATE = [
  { path: 'items.resource', select: 'title isbn resourceType' },
  { path: 'items.category', select: 'name' },
  { path: 'items.shelf', select: 'name section rack' },
  { path: 'createdBy', select: 'firstName lastName' },
  { path: 'paidBy', select: 'firstName lastName' },
];

/** Header fields a draft may set; amounts are recomputed by the model. */
const EDITABLE = ['supplier', 'supplierContact', 'supplierAddress', 'expectedDate', 'notes', 'discount', 'taxRate', 'shippingCost'];

async function list(query = {}, options = {}) {
  const pagination = buildPagination(query, { defaultSort: '-createdAt', ...options });
  const filter = compact({ status: query.status, paymentStatus: query.paymentStatus });
  if (query.search) {
    filter.$or = [
      { orderCode: like(query.search) },
      { invoiceNumber: like(query.search) },
      { supplier: like(query.search) },
      { 'items.title': like(query.search) },
    ];
  }
  return paginate(PurchaseOrder, filter, pagination, { populate: POPULATE, select: '-receipts' });
}

async function getById(id) {
  const order = await PurchaseOrder.findById(id).populate([
    ...POPULATE,
    { path: 'receipts.shelf', select: 'name section rack' },
    { path: 'receipts.receivedBy', select: 'firstName lastName' },
  ]);
  if (!order) throw ApiError.notFound('Purchase order not found');
  return order;
}

/** Counts by status, for the tabs on the orders page. */
async function summary() {
  const rows = await PurchaseOrder.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 }, amount: { $sum: '$totalAmount' } } },
  ]);
  return rows.reduce((acc, r) => { acc[r._id] = { count: r.count, amount: r.amount }; return acc; }, {});
}

/**
 * Items may reference an existing title (then its details are copied in) or be
 * typed in by hand for a title not yet in the catalogue.
 */
async function normaliseItems(items) {
  const out = [];
  for (const item of items) {
    let { title, authors, isbn } = item;
    if (item.resource) {
      // eslint-disable-next-line no-await-in-loop
      const resource = await Resource.findById(item.resource).populate('authors', 'fullName');
      if (!resource) throw ApiError.badRequest('A selected catalogue title no longer exists');
      title = resource.title;
      isbn = resource.isbn || '';
      authors = (resource.authors || []).map((a) => a.fullName).join('; ');
    }
    if (!title) throw ApiError.badRequest('Every order line needs a title');
    out.push({
      _id: item._id || item.id,
      resource: item.resource || null,
      title,
      authors: authors || '',
      isbn: String(isbn || '').replace(/[\s-]/g, ''),
      category: item.category || null,
      shelf: item.shelf || null,
      quantity: item.quantity,
      unitPrice: item.unitPrice || 0,
      receivedQuantity: item.receivedQuantity || 0,
    });
  }
  return out;
}

async function create(payload, actor, context = {}) {
  const order = await PurchaseOrder.create({
    orderCode: orderCode(),
    supplier: payload.supplier,
    supplierContact: payload.supplierContact || '',
    supplierAddress: payload.supplierAddress || '',
    expectedDate: payload.expectedDate || null,
    notes: payload.notes || '',
    discount: payload.discount || 0,
    taxRate: payload.taxRate || 0,
    shippingCost: payload.shippingCost || 0,
    items: await normaliseItems(payload.items),
    status: 'draft',
    createdBy: actor._id,
    updatedBy: actor._id,
  });
  await auditService.record({
    ...context, actor, action: 'purchase_order_created', entityType: 'PurchaseOrder', entityId: order._id,
    entityLabel: order.orderCode, description: `Draft order for ${order.supplier} (${order.items.length} line(s))`,
  });
  return getById(order._id);
}

/** Only a draft can be edited; once placed, the order is a record of what was sent. */
async function update(id, payload, actor, context = {}) {
  const order = await PurchaseOrder.findById(id);
  if (!order) throw ApiError.notFound('Purchase order not found');
  if (order.status !== 'draft') throw ApiError.conflict('Only a draft order can be edited');

  EDITABLE.forEach((field) => {
    if (payload[field] !== undefined) order[field] = payload[field];
  });
  if (payload.items) order.items = await normaliseItems(payload.items);
  order.updatedBy = actor._id;
  await order.save();

  await auditService.record({
    ...context, actor, action: 'purchase_order_updated', entityType: 'PurchaseOrder', entityId: order._id,
    entityLabel: order.orderCode,
  });
  return getById(id);
}

/**
 * Moves an order out of the state described by `from` in one guarded update,
 * so two requests racing on the same order cannot both succeed.
 */
async function transition(id, from, changes, describeConflict) {
  const result = await PurchaseOrder.updateOne({ _id: id, ...from }, { $set: changes }, { runValidators: true });
  if (result.matchedCount) return;
  const current = await PurchaseOrder.findById(id).select('status paymentStatus');
  if (!current) throw ApiError.notFound('Purchase order not found');
  throw ApiError.conflict(describeConflict(current));
}

async function place(id, actor, context = {}) {
  const order = await PurchaseOrder.findById(id).select('orderCode supplier invoiceNumber');
  if (!order) throw ApiError.notFound('Purchase order not found');

  await transition(
    id,
    { status: 'draft' },
    {
      status: 'ordered', orderedAt: new Date(), invoiceNumber: order.invoiceNumber || invoiceCode(), updatedBy: actor._id,
    },
    (current) => `This order is already ${current.status.replace('_', ' ')}`,
  );

  await auditService.record({
    ...context, actor, action: 'purchase_order_placed', entityType: 'PurchaseOrder', entityId: order._id,
    entityLabel: order.orderCode, description: `Order placed with ${order.supplier}`,
  });
  return getById(id);
}

async function findOrCreateAuthors(names, actor) {
  const ids = [];
  for (const name of String(names || '').split(/[;|]/).map((s) => s.trim()).filter(Boolean)) {
    // eslint-disable-next-line no-await-in-loop
    let author = await Author.findOne({ fullName: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
    if (!author) {
      const parts = name.split(/\s+/);
      const lastName = parts.length > 1 ? parts.pop() : parts[0];
      // eslint-disable-next-line no-await-in-loop
      author = await Author.create({ firstName: parts.join(' ') || lastName, lastName, createdBy: actor._id });
    }
    ids.push(author._id);
  }
  return ids;
}

/** Resolves a line to a catalogue title, creating the record on first receipt. */
async function resolveResource(item, shelfId, actor) {
  if (item.resource) return item.resource;

  if (item.isbn) {
    const existing = await Resource.findOne({ isbn: item.isbn }).select('_id');
    if (existing) return existing._id;
  }

  const resource = await Resource.create({
    title: item.title,
    resourceType: 'book',
    isbn: item.isbn || null,
    authors: await findOrCreateAuthors(item.authors, actor),
    category: item.category || null,
    shelf: shelfId || null,
    purchasePrice: item.unitPrice || 0,
    replacementCost: item.unitPrice || 0,
    acquisitionDate: new Date(),
    acquisitionSource: 'purchase',
    createdBy: actor._id,
    updatedBy: actor._id,
  });
  return resource._id;
}

/**
 * Books in a delivery. For each received line the copies are created on the
 * chosen shelf (defaulting to the line's shelf), and a title that was not yet
 * catalogued is added to the catalogue first.
 *
 * Over-receiving is capped at what is still outstanding on the line.
 */
async function receive(id, { lines }, actor, context = {}) {
  const order = await PurchaseOrder.findById(id);
  if (!order) throw ApiError.notFound('Purchase order not found');
  if (!['ordered', 'partially_received'].includes(order.status)) {
    throw ApiError.conflict(order.status === 'draft'
      ? 'Place the order before receiving stock'
      : `This order is already ${order.status.replace('_', ' ')}`);
  }

  const summaryLines = [];
  const receipts = [];
  for (const line of lines) {
    const item = order.items.id(line.item);
    if (!item) throw ApiError.badRequest('A received line does not belong to this order');

    const outstanding = item.quantity - item.receivedQuantity;
    const quantity = Math.min(line.quantity, outstanding);
    if (quantity <= 0) continue;

    const shelfId = line.shelf || item.shelf || null;
    if (shelfId) {
      // eslint-disable-next-line no-await-in-loop
      const shelf = await Shelf.findById(shelfId).select('_id');
      if (!shelf) throw ApiError.badRequest('The selected shelf does not exist');
    }

    // Claim the quantity before creating any copies. The update only matches
    // while the line still has the received count read above, so a duplicate
    // or simultaneous delivery loses here.
    // eslint-disable-next-line no-await-in-loop
    const claim = await PurchaseOrder.updateOne(
      {
        _id: id,
        status: { $in: ['ordered', 'partially_received'] },
        items: { $elemMatch: { _id: item._id, receivedQuantity: item.receivedQuantity } },
      },
      { $inc: { 'items.$.receivedQuantity': quantity } },
    );
    if (!claim.matchedCount) {
      throw ApiError.conflict('This order was changed by someone else while receiving. Reload it and try again.');
    }

    try {
      // eslint-disable-next-line no-await-in-loop
      const resourceId = await resolveResource(item, shelfId, actor);
      // eslint-disable-next-line no-await-in-loop
      await copyService.createBatch(
        {
          resource: resourceId,
          quantity,
          shelf: shelfId || undefined,
          price: item.unitPrice || 0,
          replacementCost: item.unitPrice || 0,
        },
        actor,
        context,
      );
      // eslint-disable-next-line no-await-in-loop
      await PurchaseOrder.updateOne(
        { _id: id },
        { $set: { 'items.$[line].resource': resourceId } },
        { arrayFilters: [{ 'line._id': item._id }] },
      );
    } catch (err) {
      // Hand the claimed quantity back so the line can be received again.
      // eslint-disable-next-line no-await-in-loop
      await PurchaseOrder.updateOne({ _id: id, 'items._id': item._id }, { $inc: { 'items.$.receivedQuantity': -quantity } });
      throw err;
    }

    receipts.push({
      item: item._id, title: item.title, quantity, shelf: shelfId, receivedBy: actor._id, receivedAt: new Date(),
    });
    summaryLines.push({ title: item.title, quantity });
  }

  if (!summaryLines.length) throw ApiError.badRequest('Nothing to receive: every line is already fully received');

  const stored = await PurchaseOrder.findById(id).select('items');
  const complete = stored.items.every((i) => i.receivedQuantity >= i.quantity);
  const changes = { status: complete ? 'received' : 'partially_received', updatedBy: actor._id };
  if (complete) changes.receivedAt = new Date();
  await PurchaseOrder.updateOne({ _id: id }, { $set: changes, $push: { receipts: { $each: receipts } } });

  await auditService.record({
    ...context, actor, action: 'purchase_order_received', entityType: 'PurchaseOrder', entityId: order._id,
    entityLabel: order.orderCode,
    description: `Received ${summaryLines.reduce((s, l) => s + l.quantity, 0)} copy/copies`,
    newValue: { status: changes.status, lines: summaryLines },
  });

  return { order: await getById(id), received: summaryLines };
}

async function cancel(id, reason, actor, context = {}) {
  const order = await PurchaseOrder.findById(id).select('orderCode');
  if (!order) throw ApiError.notFound('Purchase order not found');

  await transition(
    id,
    { status: { $in: ['draft', 'ordered'] }, paymentStatus: { $ne: 'paid' } },
    {
      status: 'cancelled', cancelledAt: new Date(), cancelReason: reason || '', updatedBy: actor._id,
    },
    (current) => (current.paymentStatus === 'paid'
      ? 'A paid order cannot be cancelled'
      : 'Only a draft or an order with nothing received can be cancelled'),
  );

  await auditService.record({
    ...context, actor, action: 'purchase_order_cancelled', entityType: 'PurchaseOrder', entityId: order._id,
    entityLabel: order.orderCode, description: reason || 'Cancelled',
  });
  return getById(id);
}

/** Settles the supplier's invoice in full. The invoice then prints as a paid receipt. */
async function recordPayment(id, { method, reference, paidAt }, actor, context = {}) {
  const order = await PurchaseOrder.findById(id).select('orderCode invoiceNumber totalAmount');
  if (!order) throw ApiError.notFound('Purchase order not found');

  await transition(
    id,
    { status: { $nin: ['draft', 'cancelled'] }, paymentStatus: { $ne: 'paid' } },
    {
      paymentStatus: 'paid',
      paymentMethod: method,
      paymentReference: reference || '',
      paidAt: paidAt || new Date(),
      paidBy: actor._id,
      updatedBy: actor._id,
    },
    (current) => {
      if (current.paymentStatus === 'paid') return 'This invoice is already paid';
      return current.status === 'draft' ? 'Place the order before recording a payment' : 'A cancelled order cannot be paid';
    },
  );

  await auditService.record({
    ...context, actor, action: 'purchase_order_paid', entityType: 'PurchaseOrder', entityId: order._id,
    entityLabel: order.invoiceNumber || order.orderCode,
    description: `Invoice paid (${order.totalAmount.toFixed(2)} by ${method.replace('_', ' ')})`,
  });
  return getById(id);
}

module.exports = {
  list, getById, summary, create, update, place, receive, cancel, recordPayment,
};