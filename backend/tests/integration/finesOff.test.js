const dayjs = require('dayjs');
const request = require('supertest');
const {
  app, api, as, ensureRoles, ensureSettings, createAndSignIn,
  createResource, resetDatabase, models,
} = require('../helpers');

const { Loan, Fine, User } = models;

/** Settings > Circulation > "Charge fines" switched off. */
const finesOff = () => ensureSettings({ circulation: { finesEnabled: false } });

describe('Fines turned off', () => {
  let librarian;
  let admin;
  let student;

  beforeAll(async () => {
    await resetDatabase();
    await ensureRoles();
    librarian = await createAndSignIn('librarian');
    admin = await createAndSignIn('admin');
    student = await createAndSignIn('student', { registrationNumber: 'REG/NOFINE/0001' });
  });

  afterAll(resetDatabase);

  beforeEach(async () => {
    await Promise.all([Loan.deleteMany({}), Fine.deleteMany({})]);
    await User.updateMany({}, { $set: { activeLoanCount: 0, outstandingFineTotal: 0 } });
    await finesOff();
  });

  /** A fine raised while fines were still on, then the switch is turned off. */
  const leftoverFine = async (amount = 50) => {
    await ensureSettings();
    const raised = await as(librarian.token).post('/fines', {
      user: String(student.user.id), fineType: 'administrative', amount, reason: 'Raised before the switch',
    });
    expect(raised.status).toBe(201);
    await finesOff();
    return raised.body.data;
  };

  it('raises no fine for a late return', async () => {
    const { copies } = await createResource({ copyCount: 1 });
    const issued = await as(librarian.token).post('/loans/issue', {
      userIdentifier: 'REG/NOFINE/0001', copyIdentifier: copies[0].barcode,
    });
    await Loan.updateOne({ _id: issued.body.data.id }, { $set: { dueDate: dayjs().subtract(10, 'day').toDate() } });

    const response = await as(librarian.token).post('/loans/return', {
      copyIdentifier: copies[0].barcode, condition: 'damaged',
    });

    expect(response.status).toBe(200);
    // The lateness is still recorded; it just isn't charged.
    expect(response.body.data.daysOverdue).toBe(10);
    expect(response.body.data.fines).toHaveLength(0);
    expect(await Fine.countDocuments({})).toBe(0);
  });

  it('raises no replacement charge when a loan is marked lost', async () => {
    const { copies } = await createResource({ copyCount: 1 });
    const issued = await as(librarian.token).post('/loans/issue', {
      userIdentifier: 'REG/NOFINE/0001', copyIdentifier: copies[0].barcode,
    });

    const response = await as(librarian.token).post(`/loans/${issued.body.data.id}/lost`, { reason: 'Left on a bus' });

    expect(response.status).toBe(200);
    expect(response.body.data.fines).toHaveLength(0);
    expect(await Fine.countDocuments({})).toBe(0);
  });

  it('refuses to raise a fine by hand', async () => {
    const response = await as(librarian.token).post('/fines', {
      user: String(student.user.id), fineType: 'administrative', amount: 10, reason: 'Should be refused',
    });

    expect(response.status).toBe(409);
    expect(response.body.message).toMatch(/turned off/i);
  });

  it('no longer lets an old unpaid fine block borrowing or clearance, but keeps the record', async () => {
    const fine = await leftoverFine(50);

    const eligibility = await as(librarian.token).get(`/loans/eligibility?userId=${student.user.id}`);
    const clearance = await as(librarian.token).get('/clearance/check?identifier=REG/NOFINE/0001');

    expect(eligibility.body.data.eligible).toBe(true);
    expect(clearance.body.data.isClear).toBe(true);
    expect(clearance.body.data.fines).toHaveLength(0);
    expect(await Fine.findById(fine.id)).not.toBeNull();
  });

  it('hides fine reports and fine columns', async () => {
    const reports = await as(admin.token).get('/reports');
    const overdue = await as(admin.token).get('/reports/circulation-overdue');

    expect(reports.status).toBe(200);
    expect(reports.body.data.length).toBeGreaterThan(0);
    expect(reports.body.data.some((r) => r.group === 'fines')).toBe(false);
    expect(overdue.status).toBe(200);
    expect(overdue.body.data.columns.map((c) => c.key)).not.toContain('fineAmount');
  });

  it('tells every browser, signed in or not, that fines are off', async () => {
    const response = await request(app).get(api('/settings/public'));

    expect(response.status).toBe(200);
    expect(response.body.data.circulation.finesEnabled).toBe(false);
  });
});
