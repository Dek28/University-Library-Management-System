const mongoose = require('mongoose');
const { toJSONPlugin } = require('./plugins/common');
const { PURCHASE_ORDER_STATUS, PAYMENT_STATUS, PAYMENT_METHODS } = require('../constants/enums');

const { Schema } = mongoose;

/**
 * One line of an order. A line either points at an existing catalogue title
 * (`resource`) or describes a title that is not catalogued yet; in the second
 * case the catalogue record is created when the stock is received.
 */
const orderItemSchema = new Schema(
  {
    resource: { type: Schema.Types.ObjectId, ref: 'Resource', default: null },
    title: { type: String, required: true, trim: true },
    authors: { type: String, trim: true, default: '' },
    isbn: { type: String, trim: true, default: '' },
    category: { type: Schema.Types.ObjectId, ref: 'Category', default: null },
    shelf: { type: Schema.Types.ObjectId, ref: 'Shelf', default: null },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, min: 0, default: 0 },
    receivedQuantity: { type: Number, min: 0, default: 0 },
  },
  { _id: true },
);

const receiptSchema = new Schema(
  {
    item: { type: Schema.Types.ObjectId, required: true },
    title: { type: String, default: '' },
    quantity: { type: Number, required: true, min: 1 },
    shelf: { type: Schema.Types.ObjectId, ref: 'Shelf', default: null },
    receivedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    receivedAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

/** A purchase order for new library stock. */
const purchaseOrderSchema = new Schema(
  {
    orderCode: { type: String, required: true, unique: true },
    // Assigned when the order is placed; the invoice is only issued from then on.
    invoiceNumber: { type: String, default: null },
    supplier: { type: String, required: true, trim: true },
    supplierContact: { type: String, trim: true, default: '' },
    supplierAddress: { type: String, trim: true, default: '' },
    status: { type: String, enum: PURCHASE_ORDER_STATUS, default: 'draft', index: true },

    items: { type: [orderItemSchema], validate: (v) => v.length > 0 },
    receipts: [receiptSchema],

    // Invoice amounts. `taxRate` is a percentage applied after the discount.
    subtotal: { type: Number, min: 0, default: 0 },
    discount: { type: Number, min: 0, default: 0 },
    taxRate: { type: Number, min: 0, max: 100, default: 0 },
    taxAmount: { type: Number, min: 0, default: 0 },
    shippingCost: { type: Number, min: 0, default: 0 },
    totalAmount: { type: Number, min: 0, default: 0 },

    paymentStatus: { type: String, enum: PAYMENT_STATUS, default: 'unpaid', index: true },
    paymentMethod: { type: String, enum: [...PAYMENT_METHODS, null], default: null },
    paymentReference: { type: String, trim: true, default: '' },
    paidAt: { type: Date, default: null },
    paidBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },

    expectedDate: { type: Date, default: null },
    orderedAt: { type: Date, default: null },
    receivedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    cancelReason: { type: String, trim: true, default: '' },
    notes: { type: String, trim: true, default: '' },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

purchaseOrderSchema.plugin(toJSONPlugin);
purchaseOrderSchema.index({ createdAt: -1 });
// Drafts all carry a null invoice number, so uniqueness only applies to issued
// (string) numbers. A sparse index would not do: it still indexes nulls.
purchaseOrderSchema.index(
  { invoiceNumber: 1 },
  { unique: true, partialFilterExpression: { invoiceNumber: { $type: 'string' } }, name: 'unique_invoice_number' },
);

const round2 = (n) => Math.round(n * 100) / 100;

purchaseOrderSchema.pre('validate', function computeTotal(next) {
  this.subtotal = round2((this.items || []).reduce((sum, i) => sum + i.quantity * (i.unitPrice || 0), 0));
  // A discount can never take the order below zero.
  const discounted = Math.max(0, this.subtotal - (this.discount || 0));
  this.taxAmount = round2(discounted * ((this.taxRate || 0) / 100));
  this.totalAmount = round2(discounted + this.taxAmount + (this.shippingCost || 0));
  next();
});

module.exports = mongoose.model('PurchaseOrder', purchaseOrderSchema);