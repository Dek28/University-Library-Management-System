const catchAsync = require('../utils/catchAsync');
const { ok, created, paginated } = require('../utils/response');
const orderService = require('../services/purchaseOrder.service');
const settingsService = require('../services/settings.service');
const { EXPORT_PAGE, EXPORT_OPTIONS } = require('../utils/query');
const { buildWorkbook, sendWorkbook } = require('../reports/excel');
const { streamTableReport } = require('../reports/pdf');
const { renderOrderDocument } = require('../reports/orderDocument');

const ORDER_COLUMNS = [
  { header: 'Order', key: 'orderCode', width: 1.9 },
  { header: 'Invoice', key: 'invoiceNumber', width: 1.9 },
  { header: 'Supplier', key: 'supplier', width: 2.4 },
  { header: 'Titles', key: 'titles', width: 0.7, type: 'number', align: 'right' },
  { header: 'Copies', key: 'copies', width: 0.7, type: 'number', align: 'right' },
  { header: 'Received', key: 'received', width: 0.9, type: 'number', align: 'right' },
  { header: 'Total', key: 'totalAmount', width: 1.1, type: 'money', align: 'right' },
  { header: 'Status', key: 'status', width: 1.4 },
  { header: 'Payment', key: 'paymentStatus', width: 0.9 },
  { header: 'Ordered', key: 'orderedAt', width: 1.1, type: 'date' },
  { header: 'Created', key: 'createdAt', width: 1.1, type: 'date' },
];

const toOrderRow = (o, { asText = false } = {}) => {
  const date = (v) => (v ? (asText ? new Date(v).toISOString().slice(0, 10) : new Date(v)) : '');
  const items = o.items || [];
  // A draft or cancelled order has no invoice to pay, so its payment status means nothing.
  const invoiced = !['draft', 'cancelled'].includes(o.status);
  return {
    orderCode: o.orderCode,
    invoiceNumber: o.invoiceNumber || '',
    supplier: o.supplier,
    titles: items.length,
    copies: items.reduce((sum, i) => sum + i.quantity, 0),
    received: items.reduce((sum, i) => sum + (i.receivedQuantity || 0), 0),
    totalAmount: asText ? Number(o.totalAmount || 0).toFixed(2) : Number(o.totalAmount || 0),
    status: o.status.replace(/_/g, ' '),
    paymentStatus: invoiced ? o.paymentStatus : '',
    orderedAt: date(o.orderedAt),
    createdAt: date(o.createdAt),
  };
};

const list = catchAsync(async (req, res) => {
  const { format, ...query } = req.query;

  if (format && format !== 'json') {
    const { items, total } = await orderService.list({ ...query, ...EXPORT_PAGE }, EXPORT_OPTIONS);
    const settings = await settingsService.getSettings();
    const filters = [
      query.status && `status ${query.status.replace(/_/g, ' ')}`,
      query.paymentStatus && query.paymentStatus,
      query.search && `matching "${query.search}"`,
    ].filter(Boolean).join(', ');
    const subtitle = `Purchase orders and invoices${filters ? ` (${filters})` : ''}`;
    const meta = {
      generatedBy: req.user.fullName,
      total: items.length,
      truncatedFrom: total > items.length ? total : undefined,
    };

    if (format === 'pdf') {
      return streamTableReport(res, {
        filename: 'book-orders.pdf',
        title: 'Book Orders',
        subtitle,
        institution: settings.institution,
        meta,
        columns: ORDER_COLUMNS,
        rows: items.map((o) => toOrderRow(o, { asText: true })),
      });
    }
    const workbook = await buildWorkbook({
      title: 'Book Orders', subtitle,
      columns: ORDER_COLUMNS, rows: items.map((o) => toOrderRow(o)), meta, sheetName: 'Orders',
    });
    return sendWorkbook(res, workbook, 'book-orders.xlsx', meta);
  }

  const result = await orderService.list(query);
  return paginated(res, { items: result.items, page: result.page, limit: result.limit, total: result.total });
});

const summary = catchAsync(async (req, res) =>
  ok(res, { message: 'Order summary', data: await orderService.summary() }));

const getOne = catchAsync(async (req, res) =>
  ok(res, { message: 'Order loaded', data: await orderService.getById(req.params.id) }));

const create = catchAsync(async (req, res) =>
  created(res, { message: 'Draft order created', data: await orderService.create(req.body, req.user, { req }) }));

const update = catchAsync(async (req, res) =>
  ok(res, { message: 'Order updated', data: await orderService.update(req.params.id, req.body, req.user, { req }) }));

const place = catchAsync(async (req, res) =>
  ok(res, { message: 'Order placed', data: await orderService.place(req.params.id, req.user, { req }) }));

const receive = catchAsync(async (req, res) => {
  const result = await orderService.receive(req.params.id, req.body, req.user, { req });
  const total = result.received.reduce((sum, l) => sum + l.quantity, 0);
  return ok(res, { message: `Received ${total} copy/copies into stock`, data: result });
});

const cancel = catchAsync(async (req, res) =>
  ok(res, { message: 'Order cancelled', data: await orderService.cancel(req.params.id, req.body.reason, req.user, { req }) }));

const pay = catchAsync(async (req, res) =>
  ok(res, { message: 'Payment recorded', data: await orderService.recordPayment(req.params.id, req.body, req.user, { req }) }));

/** Printable order form / invoice; see reports/orderDocument.js for the layout. */
const invoice = catchAsync(async (req, res) => {
  const order = await orderService.getById(req.params.id);
  const settings = await settingsService.getSettings();
  renderOrderDocument(res, {
    order,
    institution: settings.institution || {},
    currencySymbol: settings.locale?.currencySymbol || '',
    generatedBy: req.user.fullName,
    inline: req.query.inline === 'true',
  });
});

module.exports = {
  list, summary, getOne, create, update, place, receive, cancel, pay, invoice,
};
