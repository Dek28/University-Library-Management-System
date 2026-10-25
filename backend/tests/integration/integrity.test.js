const {
  as, ensureRoles, ensureSettings, createUser, createAndSignIn, createResource, resetDatabase, models,
} = require('../helpers');

const {
  Loan, Fine, Reservation, ResourceCopy, InventoryAudit,
} = models;

describe('Stock and hold integrity', () => {
  let librarian;
  let scenario = 0;

  beforeAll(async () => {
    await resetDatabase();
    await ensureRoles();
    await ensureSettings();
    librarian = await createAndSignIn('librarian');
  });

  afterAll(resetDatabase);

  beforeEach(async () => {
    await Promise.all([Loan.deleteMany({}), Fine.deleteMany({}), Reservation.deleteMany({}), InventoryAudit.deleteMany({})]);
  });

  /** Two copies on loan to two members, with a third member queued behind them. */
  async function queueOneHoldBehindTwoLoans() {
    const { resource, copies } = await createResource({ copyCount: 2 });
    scenario += 1;
    const first = await createUser('student', { registrationNumber: `REG/INT/${scenario}/A` });
    const second = await createUser('student', { registrationNumber: `REG/INT/${scenario}/B` });
    const waiting = await createUser('student', { registrationNumber: `REG/INT/${scenario}/C` });

    const issue = (member, copy) => as(librarian.token).post('/loans/issue', {
      userIdentifier: member.registrationNumber, copyIdentifier: copy.barcode,
    });
    expect((await issue(first, copies[0])).status).toBe(201);
    expect((await issue(second, copies[1])).status).toBe(201);

    const hold = await as(librarian.token).post('/reservations', { resource: String(resource._id), user: String(waiting._id) });
    expect(hold.status).toBe(201);
    return { copies, hold: hold.body.data };
  }

  it('gives one waiting hold to one returned copy when two copies come back together', async () => {
    const { copies, hold } = await queueOneHoldBehindTwoLoans();

    const giveBack = (copy) => as(librarian.token).post('/loans/return', { copyIdentifier: copy.barcode, condition: 'good' });
    const results = await Promise.all(copies.map(giveBack));
    results.forEach((r) => expect(r.status).toBe(200));

    const statuses = (await ResourceCopy.find({ _id: { $in: copies.map((c) => c._id) } })).map((c) => c.status).sort();
    expect(statuses).toEqual(['available', 'reserved']);

    const reservation = await Reservation.findById(hold.id);
    expect(reservation.status).toBe('ready');
    expect((await ResourceCopy.findById(reservation.copy)).status).toBe('reserved');
  });

  it('refuses to change the status of a copy that is being held for a member', async () => {
    const { copies, hold } = await queueOneHoldBehindTwoLoans();
    await as(librarian.token).post('/loans/return', { copyIdentifier: copies[0].barcode, condition: 'good' });
    const held = await Reservation.findById(hold.id);
    expect(held.status).toBe('ready');

    const response = await as(librarian.token).patch(`/inventory/copies/${held.copy}/adjust`, {
      status: 'missing', reason: 'Not on the shelf',
    });

    expect(response.status).toBe(409);
    expect((await ResourceCopy.findById(held.copy)).status).toBe('reserved');
  });

  it('keeps an accurate count when several stock-audit scans arrive at once', async () => {
    const { copies } = await createResource({ copyCount: 6 });
    const started = await as(librarian.token).post('/inventory/audits', { title: 'Concurrent scanning' });
    expect(started.status).toBe(201);
    const auditId = started.body.data.id;

    const scan = (copy) => as(librarian.token).post(`/inventory/audits/${auditId}/items`, {
      identifier: copy.barcode, foundStatus: 'found',
    });
    const results = await Promise.all(copies.map(scan));
    results.forEach((r) => expect(r.status).toBe(200));

    const audit = await InventoryAudit.findById(auditId);
    expect(audit.items).toHaveLength(6);
    expect(audit.verifiedCount).toBe(6);
  });

  it('replaces an earlier entry when the same copy is scanned again', async () => {
    const { copies } = await createResource({ copyCount: 1 });
    const started = await as(librarian.token).post('/inventory/audits', { title: 'Rescan' });
    const auditId = started.body.data.id;

    await as(librarian.token).post(`/inventory/audits/${auditId}/items`, { identifier: copies[0].barcode, foundStatus: 'missing' });
    await as(librarian.token).post(`/inventory/audits/${auditId}/items`, { identifier: copies[0].barcode, foundStatus: 'found' });

    const audit = await InventoryAudit.findById(auditId);
    expect(audit.items).toHaveLength(1);
    expect(audit.items[0].foundStatus).toBe('found');
    expect(audit.verifiedCount).toBe(1);
    expect(audit.missingCount).toBe(0);
  });
});
