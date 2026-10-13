const {
  as, ensureRoles, ensureSettings, createAndSignIn, createResource, resetDatabase, models,
} = require('../helpers');

const { PurchaseOrder, ResourceCopy, Resource } = models;

describe('Book orders and invoices', () => {
  let librarian;
  let student;

  beforeAll(async () => {
    await resetDatabase();
    await ensureRoles();
    await ensureSettings();
    librarian = await createAndSignIn('librarian');
    student = await createAndSignIn('student', { registrationNumber: 'REG/PO/0001' });
  });

  afterAll(async () => {
    await PurchaseOrder.deleteMany({});
    await resetDatabase();
  });

  beforeEach(() => PurchaseOrder.deleteMany({}));

  const draft = async (overrides = {}) => {
    const response = await as(librarian.token).post('/purchase-orders', {
      supplier: 'Campus Book Distributors',
      supplierContact: 'orders@campusbooks.test',
      discount: 10,
      taxRate: 10,
      shippingCost: 5,
      items: [
        { title: 'Introduction to Algorithms', authors: 'Thomas Cormen', isbn: '978-0262046305', quantity: 2, unitPrice: 50 },
        { title: 'Clean Code', quantity: 1, unitPrice: 30 },
      ],
      ...overrides,
    });
    expect(response.status).toBe(201);
    return response.body.data;
  };

  it('computes invoice totals: subtotal, discount, tax and shipping', async () => {
    const order = await draft();
    expect(order.orderCode).toMatch(/^PO-/);
    expect(order.status).toBe('draft');
    expect(order.subtotal).toBeCloseTo(130, 2);
    expect(order.taxAmount).toBeCloseTo(12, 2); // 10% of (130 - 10)
    expect(order.totalAmount).toBeCloseTo(137, 2); // 120 + 12 + 5
    expect(order.invoiceNumber).toBeNull();
  });

  it('allows several drafts at once (none has an invoice number yet)', async () => {
    await draft();
    await draft({ supplier: 'Second Supplier' });
    await draft({ supplier: 'Third Supplier' });
    expect(await PurchaseOrder.countDocuments({ status: 'draft' })).toBe(3);
  });

  it('issues an invoice number when placed, and locks the order against edits', async () => {
    const order = await draft();
    const placed = await as(librarian.token).post(`/purchase-orders/${order.id}/place`);
    expect(placed.status).toBe(200);
    expect(placed.body.data.invoiceNumber).toMatch(/^INV-/);

    const edit = await as(librarian.token).patch(`/purchase-orders/${order.id}`, { supplier: 'Someone else' });
    expect(edit.status).toBe(409);
  });

  it('prints the order form and invoice as a PDF', async () => {
    const order = await draft();
    const form = await as(librarian.token).get(`/purchase-orders/${order.id}/invoice`);
    expect(form.status).toBe(200);
    expect(form.headers['content-type']).toBe('application/pdf');
    expect(form.headers['content-disposition']).toMatch(/order-PO-/);

    await as(librarian.token).post(`/purchase-orders/${order.id}/place`);
    const invoice = await as(librarian.token).get(`/purchase-orders/${order.id}/invoice?inline=true`);
    expect(invoice.status).toBe(200);
    expect(invoice.headers['content-disposition']).toMatch(/^inline; filename="invoice-INV-/);
    expect(invoice.body.length).toBeGreaterThan(800);
  });

  it('receives stock into the catalogue, then records payment', async () => {
    const { resource: existing } = await createResource({ copyCount: 0 });
    const order = await draft({
      items: [
        { resource: String(existing._id), quantity: 2, unitPrice: 20 },
        { title: 'A Brand New Title', isbn: '9780000000001', quantity: 1, unitPrice: 15 },
      ],
    });

    const tooEarly = await as(librarian.token).post(`/purchase-orders/${order.id}/pay`, { method: 'cash' });
    expect(tooEarly.status).toBe(409);

    await as(librarian.token).post(`/purchase-orders/${order.id}/place`);

    const received = await as(librarian.token).post(`/purchase-orders/${order.id}/receive`, {
      lines: order.items.map((i) => ({ item: i.id || i._id, quantity: i.quantity })),
    });
    expect(received.status).toBe(200);
    expect(received.body.data.order.status).toBe('received');
    expect(await ResourceCopy.countDocuments({ resource: existing._id })).toBe(2);
    expect(await Resource.countDocuments({ isbn: '9780000000001' })).toBe(1);

    const paid = await as(librarian.token).post(`/purchase-orders/${order.id}/pay`, {
      method: 'bank_transfer', reference: 'TRX-1001',
    });
    expect(paid.status).toBe(200);
    expect(paid.body.data.paymentStatus).toBe('paid');
    expect(paid.body.data.paymentReference).toBe('TRX-1001');

    const again = await as(librarian.token).post(`/purchase-orders/${order.id}/pay`, { method: 'cash' });
    expect(again.status).toBe(409);

    const receipt = await as(librarian.token).get(`/purchase-orders/${order.id}/invoice`);
    expect(receipt.status).toBe(200);
  });

  it('refuses to cancel a paid order', async () => {
    const order = await draft();
    await as(librarian.token).post(`/purchase-orders/${order.id}/place`);
    await as(librarian.token).post(`/purchase-orders/${order.id}/pay`, { method: 'cheque' });

    const cancel = await as(librarian.token).post(`/purchase-orders/${order.id}/cancel`, { reason: 'Changed mind' });
    expect(cancel.status).toBe(409);
  });

  it('exports the filtered order list as Excel and PDF', async () => {
    const placed = await draft();
    await as(librarian.token).post(`/purchase-orders/${placed.id}/place`);
    await draft({ supplier: 'Draft Only Supplier' });

    const excel = await as(librarian.token).get('/purchase-orders?format=xlsx&status=ordered')
      .buffer(true).parse((r, cb) => { const c = []; r.on('data', (d) => c.push(d)); r.on('end', () => cb(null, Buffer.concat(c))); });
    expect(excel.status).toBe(200);
    expect(excel.headers['content-disposition']).toMatch(/book-orders\.xlsx/);

    const ExcelJS = require('exceljs');
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(excel.body);
    const text = [];
    book.worksheets[0].eachRow((row) => text.push(row.values.join('|')));
    expect(text.join('\n')).toContain(placed.orderCode);
    expect(text.join('\n')).not.toContain('Draft Only Supplier');

    const pdf = await as(librarian.token).get('/purchase-orders?format=pdf');
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');

    expect((await as(student.token).get('/purchase-orders?format=xlsx')).status).toBe(403);
  });

  it('keeps members out', async () => {
    const list = await as(student.token).get('/purchase-orders');
    expect(list.status).toBe(403);
  });
});
