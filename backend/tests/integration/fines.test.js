const {
  as, ensureRoles, ensureSettings, createUser, createAndSignIn,
  createResource, resetDatabase, models,
} = require('../helpers');

const { Fine, FinePayment, User, Loan } = models;

describe('Fines', () => {
  let librarian;
  let admin;
  let student;

  beforeAll(async () => {
    await resetDatabase();
    await ensureRoles();
    await ensureSettings();
    librarian = await createAndSignIn('librarian');
    admin = await createAndSignIn('admin');
    student = await createAndSignIn('student', { registrationNumber: 'REG/FINE/0001' });
  });

  afterAll(resetDatabase);

  beforeEach(async () => {
    await Promise.all([Fine.deleteMany({}), FinePayment.deleteMany({}), Loan.deleteMany({})]);
    await User.updateMany({}, { $set: { outstandingFineTotal: 0, activeLoanCount: 0 } });
  });

  /** Raises a manual fine and returns it. */
  const raiseFine = async (amount = 20) => {
    const response = await as(librarian.token).post('/fines', {
      user: String(student.user.id),
      fineType: 'administrative',
      amount,
      reason: 'Test charge for the fines suite',
    });
    expect(response.status).toBe(201);
    return response.body.data;
  };

  it('raises a manual fine and updates the member balance', async () => {
    const fine = await raiseFine(20);

    expect(fine.fineCode).toMatch(/^FN-/);
    expect(fine.status).toBe('outstanding');
    expect(fine.balance).toBeCloseTo(20, 2);

    const member = await User.findById(student.user.id);
    expect(member.outstandingFineTotal).toBeCloseTo(20, 2);
  });

  it('rejects a fine with a non-positive amount', async () => {
    const negative = await as(librarian.token).post('/fines', {
      user: String(student.user.id),
      fineType: 'administrative',
      amount: -10,
      reason: 'Should be rejected',
    });
    const zero = await as(librarian.token).post('/fines', {
      user: String(student.user.id),
      fineType: 'administrative',
      amount: 0,
      reason: 'Should be rejected',
    });

    expect(negative.status).toBe(422);
    expect(zero.status).toBe(422);
  });

  it('records a partial payment and leaves the remaining balance', async () => {
    const fine = await raiseFine(20);

    const response = await as(librarian.token).post(`/fines/${fine.id}/payments`, {
      amount: 8,
      method: 'cash',
    });

    expect(response.status).toBe(200);
    expect(response.body.data.payment.receiptNumber).toMatch(/^PY-/);
    expect(response.body.data.fine.status).toBe('partially_paid');
    expect(response.body.data.fine.balance).toBeCloseTo(12, 2);

    const member = await User.findById(student.user.id);
    expect(member.outstandingFineTotal).toBeCloseTo(12, 2);
  });

  it('settles a fine once it is paid in full', async () => {
    const fine = await raiseFine(15);

    await as(librarian.token).post(`/fines/${fine.id}/payments`, { amount: 10 });
    const final = await as(librarian.token).post(`/fines/${fine.id}/payments`, { amount: 5 });

    expect(final.body.data.fine.status).toBe('paid');
    expect(final.body.data.fine.balance).toBeCloseTo(0, 2);

    const member = await User.findById(student.user.id);
    expect(member.outstandingFineTotal).toBeCloseTo(0, 2);
  });

  it('refuses a payment larger than the outstanding balance', async () => {
    const fine = await raiseFine(10);

    const response = await as(librarian.token).post(`/fines/${fine.id}/payments`, { amount: 25 });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/exceeds/i);
    expect((await Fine.findById(fine.id)).amountPaid).toBe(0);
  });

  it('refuses further payment on a settled fine', async () => {
    const fine = await raiseFine(10);
    await as(librarian.token).post(`/fines/${fine.id}/payments`, { amount: 10 });

    const response = await as(librarian.token).post(`/fines/${fine.id}/payments`, { amount: 1 });
    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/already paid/i);
  });

  it('waives a balance only with a written reason', async () => {
    const fine = await raiseFine(30);

    const noReason = await as(admin.token).post(`/fines/${fine.id}/waive`, { reason: 'no' });
    expect(noReason.status).toBe(422);

    const waived = await as(admin.token).post(`/fines/${fine.id}/waive`, {
      reason: 'Approved by the head librarian following an appeal',
    });

    expect(waived.status).toBe(200);
    expect(waived.body.data.status).toBe('waived');
    expect(waived.body.data.balance).toBeCloseTo(0, 2);

    const member = await User.findById(student.user.id);
    expect(member.outstandingFineTotal).toBeCloseTo(0, 2);
  });

  it('supports a partial waiver', async () => {
    const fine = await raiseFine(40);

    const response = await as(admin.token).post(`/fines/${fine.id}/waive`, {
      amount: 15,
      reason: 'Partial waiver agreed with the faculty',
    });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('partially_paid');
    expect(response.body.data.balance).toBeCloseTo(25, 2);
  });

  it('does not let a librarian without the waive permission waive a fine', async () => {
    const fine = await raiseFine(10);

    // The default librarian role can take payment but not waive.
    const response = await as(librarian.token).post(`/fines/${fine.id}/waive`, {
      reason: 'Trying to waive without the permission',
    });

    expect(response.status).toBe(403);
  });

  it('does not let a member waive their own fine', async () => {
    const fine = await raiseFine(10);

    const response = await as(student.token).post(`/fines/${fine.id}/waive`, {
      reason: 'Please forgive this charge',
    });

    expect(response.status).toBe(403);
  });

  it('audits every waiver with the reason and the officer', async () => {
    const fine = await raiseFine(12);
    await as(admin.token).post(`/fines/${fine.id}/waive`, {
      reason: 'Waived after the item was found on the shelf',
    });

    const superAdmin = await createAndSignIn('super_admin');
    const logs = await as(superAdmin.token).get('/audit-logs?action=fine_waived');

    expect(logs.body.data.length).toBeGreaterThanOrEqual(1);
    expect(logs.body.data[0].newValue.reason).toMatch(/found on the shelf/i);
    expect(logs.body.data[0].actorName).toBeTruthy();
  });

  it('shows a member only their own fines', async () => {
    await raiseFine(10);
    const other = await createUser('student', { registrationNumber: 'REG/FINE/OTHER' });
    await as(librarian.token).post('/fines', {
      user: String(other._id),
      fineType: 'administrative',
      amount: 25,
      reason: 'Another member charge',
    });

    const response = await as(student.token).get(`/fines?user=${other._id}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].user.id).toBe(String(student.user.id));
  });

  it('reports charged, paid, waived and outstanding totals', async () => {
    const first = await raiseFine(20);
    const second = await raiseFine(30);
    await as(librarian.token).post(`/fines/${first.id}/payments`, { amount: 20 });
    await as(admin.token).post(`/fines/${second.id}/waive`, {
      amount: 10,
      reason: 'Goodwill reduction agreed at the desk',
    });

    const response = await as(librarian.token).get('/fines/summary');

    expect(response.status).toBe(200);
    expect(response.body.data.totalCharged).toBeCloseTo(50, 2);
    expect(response.body.data.totalPaid).toBeCloseTo(20, 2);
    expect(response.body.data.totalWaived).toBeCloseTo(10, 2);
    expect(response.body.data.totalOutstanding).toBeCloseTo(20, 2);
  });

  it('blocks borrowing once the outstanding balance reaches the threshold', async () => {
    // The default student threshold is 10.00.
    await raiseFine(12);
    const { copies } = await createResource({ copyCount: 1 });

    const response = await as(librarian.token).post('/loans/issue', {
      userIdentifier: 'REG/FINE/0001',
      copyIdentifier: copies[0].barcode,
    });

    expect(response.status).toBe(409);
    expect(response.body.message).toMatch(/outstanding fines/i);
  });
});
