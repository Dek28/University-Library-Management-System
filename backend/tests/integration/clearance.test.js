const dayjs = require('dayjs');
const {
  as, ensureRoles, ensureSettings, createUser, createAndSignIn,
  createResource, resetDatabase, models,
} = require('../helpers');

const { Loan, Fine, Clearance, User } = models;

describe('Student clearance', () => {
  let librarian;
  let superAdmin;
  let student;

  beforeAll(async () => {
    await resetDatabase();
    await ensureRoles();
    await ensureSettings();
    librarian = await createAndSignIn('librarian');
    superAdmin = await createAndSignIn('super_admin');
    student = await createAndSignIn('student', { registrationNumber: 'REG/CLR/0001', graduationYear: 2027 });
  });

  afterAll(resetDatabase);

  beforeEach(async () => {
    await Promise.all([Loan.deleteMany({}), Fine.deleteMany({}), Clearance.deleteMany({})]);
    await User.updateMany({}, { $set: { activeLoanCount: 0, outstandingFineTotal: 0, clearanceStatus: 'not_requested' } });
  });

  describe('Workflow F — obligation checks', () => {
    it('reports a member with no obligations as clear', async () => {
      const response = await as(librarian.token).get('/clearance/check?identifier=REG/CLR/0001');

      expect(response.status).toBe(200);
      expect(response.body.data.isClear).toBe(true);
      expect(response.body.data.blockingReasons).toHaveLength(0);
      expect(response.body.data.obligations.activeLoans).toBe(0);
    });

    it('reports outstanding loans as a blocker', async () => {
      const { copies } = await createResource({ copyCount: 1 });
      await as(librarian.token).post('/loans/issue', {
        userIdentifier: 'REG/CLR/0001',
        copyIdentifier: copies[0].barcode,
      });

      const response = await as(librarian.token).get('/clearance/check?identifier=REG/CLR/0001');

      expect(response.body.data.isClear).toBe(false);
      expect(response.body.data.obligations.activeLoans).toBe(1);
      expect(response.body.data.blockingReasons.join(' ')).toMatch(/still on loan/i);
    });

    it('reports unpaid fines as a blocker', async () => {
      await as(librarian.token).post('/fines', {
        user: String(student.user.id),
        fineType: 'administrative',
        amount: 15,
        reason: 'Unsettled charge',
      });

      const response = await as(librarian.token).get('/clearance/check?identifier=REG/CLR/0001');

      expect(response.body.data.isClear).toBe(false);
      expect(response.body.data.obligations.outstandingFineTotal).toBeCloseTo(15, 2);
      expect(response.body.data.blockingReasons.join(' ')).toMatch(/unpaid library fines/i);
    });
  });

  describe('granting clearance', () => {
    it('grants clearance and issues a certificate number when nothing is outstanding', async () => {
      const opened = await as(librarian.token).post('/clearance', { user: String(student.user.id) });
      expect(opened.status).toBe(201);
      expect(opened.body.data.status).toBe('pending');

      const approved = await as(librarian.token).post(`/clearance/${opened.body.data.id}/approve`, {
        comments: 'Verified at the desk',
      });

      expect(approved.status).toBe(200);
      expect(approved.body.data.status).toBe('cleared');
      expect(approved.body.data.certificateNumber).toMatch(/^CERT-/);
      expect(approved.body.data.isOverride).toBe(false);

      const member = await User.findById(student.user.id);
      expect(member.clearanceStatus).toBe('cleared');
    });

    it('refuses clearance while obligations remain', async () => {
      const { copies } = await createResource({ copyCount: 1 });
      await as(librarian.token).post('/loans/issue', {
        userIdentifier: 'REG/CLR/0001',
        copyIdentifier: copies[0].barcode,
      });

      const opened = await as(librarian.token).post('/clearance', { user: String(student.user.id) });
      expect(opened.body.data.status).toBe('blocked');

      const approved = await as(librarian.token).post(`/clearance/${opened.body.data.id}/approve`, {});

      expect(approved.status).toBe(409);
      expect(approved.body.message).toMatch(/still on loan/i);
      expect((await Clearance.findById(opened.body.data.id)).status).toBe('blocked');
    });

    it('re-checks obligations at the moment of approval', async () => {
      // Opened while clear…
      const opened = await as(librarian.token).post('/clearance', { user: String(student.user.id) });
      expect(opened.body.data.status).toBe('pending');

      // …then the member borrows something before approval.
      const { copies } = await createResource({ copyCount: 1 });
      await as(librarian.token).post('/loans/issue', {
        userIdentifier: 'REG/CLR/0001',
        copyIdentifier: copies[0].barcode,
      });

      const approved = await as(librarian.token).post(`/clearance/${opened.body.data.id}/approve`, {});

      // A stale "pending" snapshot must not be enough to grant clearance.
      expect(approved.status).toBe(409);
    });

    it('refuses an override from a user without the override permission', async () => {
      await as(librarian.token).post('/fines', {
        user: String(student.user.id),
        fineType: 'administrative',
        amount: 20,
        reason: 'Unsettled charge',
      });
      const opened = await as(librarian.token).post('/clearance', { user: String(student.user.id) });

      const attempted = await as(librarian.token).post(`/clearance/${opened.body.data.id}/approve`, {
        override: true,
        overrideReason: 'The head librarian approved this exception verbally',
      });

      expect(attempted.status).toBe(403);
      expect(attempted.body.message).toMatch(/not authorised to override/i);
    });

    it('requires a substantial written reason for an override', async () => {
      await as(librarian.token).post('/fines', {
        user: String(student.user.id),
        fineType: 'administrative',
        amount: 20,
        reason: 'Unsettled charge',
      });
      const opened = await as(librarian.token).post('/clearance', { user: String(student.user.id) });

      const tooShort = await as(superAdmin.token).post(`/clearance/${opened.body.data.id}/approve`, {
        override: true,
        overrideReason: 'ok',
      });

      expect(tooShort.status).toBe(400);
      expect(tooShort.body.message).toMatch(/at least 10 characters/i);
    });

    it('allows an authorised override and records it in the audit trail', async () => {
      await as(librarian.token).post('/fines', {
        user: String(student.user.id),
        fineType: 'administrative',
        amount: 20,
        reason: 'Unsettled charge',
      });
      const opened = await as(librarian.token).post('/clearance', { user: String(student.user.id) });

      const approved = await as(superAdmin.token).post(`/clearance/${opened.body.data.id}/approve`, {
        override: true,
        overrideReason: 'Appeals committee waived the charge; minute 14/2026 refers',
      });

      expect(approved.status).toBe(200);
      expect(approved.body.data.status).toBe('cleared');
      expect(approved.body.data.isOverride).toBe(true);
      // The obligations that were outstanding at approval are preserved.
      expect(approved.body.data.obligations.outstandingFineTotal).toBeCloseTo(20, 2);

      const logs = await as(superAdmin.token).get('/audit-logs?action=clearance_override');
      expect(logs.body.data.length).toBeGreaterThanOrEqual(1);
      expect(logs.body.data[0].newValue.overrideReason).toMatch(/appeals committee/i);
    });

    it('rejects a clearance request with a reason', async () => {
      const opened = await as(librarian.token).post('/clearance', { user: String(student.user.id) });

      const rejected = await as(librarian.token).post(`/clearance/${opened.body.data.id}/reject`, {
        reason: 'Return the outstanding items before requesting clearance again',
      });

      expect(rejected.status).toBe(200);
      expect(rejected.body.data.status).toBe('rejected');
      expect((await User.findById(student.user.id)).clearanceStatus).toBe('rejected');
    });
  });

  describe('certificates', () => {
    it('issues a PDF certificate only once clearance is granted', async () => {
      const opened = await as(librarian.token).post('/clearance', { user: String(student.user.id) });

      const tooEarly = await as(librarian.token).get(`/clearance/${opened.body.data.id}/certificate`);
      expect(tooEarly.status).toBe(400);

      await as(librarian.token).post(`/clearance/${opened.body.data.id}/approve`, {});

      const certificate = await as(librarian.token).get(`/clearance/${opened.body.data.id}/certificate`);
      expect(certificate.status).toBe(200);
      expect(certificate.headers['content-type']).toBe('application/pdf');
      expect(certificate.body.length).toBeGreaterThan(800);
    });
  });

  describe('self-service', () => {
    it('lets a member see their own status and request clearance', async () => {
      const status = await as(student.token).get('/clearance/my-status');
      expect(status.status).toBe(200);
      expect(status.body.data.isClear).toBe(true);

      const requested = await as(student.token).post('/clearance/request', {});
      expect(requested.status).toBe(201);
      expect(requested.body.data.status).toBe('pending');
    });

    it('does not let a member approve their own clearance', async () => {
      const opened = await as(student.token).post('/clearance/request', {});

      const approved = await as(student.token).post(`/clearance/${opened.body.data.id}/approve`, {});
      expect(approved.status).toBe(403);
    });
  });
});
