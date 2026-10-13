const dayjs = require('dayjs');
const {
  as, ensureRoles, ensureSettings, createUser, createAndSignIn,
  createResource, resetDatabase, models,
} = require('../helpers');

const { Loan, ResourceCopy, Resource, Fine, User } = models;

describe('Circulation', () => {
  let librarian;
  let student;

  beforeAll(async () => {
    await resetDatabase();
    await ensureRoles();
    await ensureSettings();
    librarian = await createAndSignIn('librarian');
    student = await createAndSignIn('student', { registrationNumber: 'REG/CIRC/0001' });
  });

  afterAll(resetDatabase);

  beforeEach(async () => {
    // Each test starts from a clean circulation state.
    await Promise.all([Loan.deleteMany({}), Fine.deleteMany({})]);
    await User.updateMany({}, { $set: { activeLoanCount: 0, outstandingFineTotal: 0 } });
  });

  describe('Workflow A — issuing', () => {
    it('issues a copy, sets the due date and marks the copy borrowed', async () => {
      const { resource, copies } = await createResource({ copyCount: 2 });

      const response = await as(librarian.token).post('/loans/issue', {
        userIdentifier: 'REG/CIRC/0001',
        copyIdentifier: copies[0].barcode,
      });

      expect(response.status).toBe(201);
      const loan = response.body.data;
      expect(loan.status).toBe('active');
      expect(loan.transactionId).toMatch(/^LN-/);

      // The student rule in the default settings is a 14-day loan.
      expect(dayjs(loan.dueDate).diff(dayjs(), 'day')).toBeGreaterThanOrEqual(13);

      const copy = await ResourceCopy.findById(copies[0]._id);
      expect(copy.status).toBe('borrowed');
      expect(String(copy.currentLoan)).toBe(loan.id);

      const refreshed = await Resource.findById(resource._id);
      expect(refreshed.availableCopies).toBe(1);
      expect(refreshed.borrowedCopies).toBe(1);
      expect(refreshed.borrowCount).toBe(1);
    });

    it('numbers loans with a daily counter in the library timezone', async () => {
      const { copies } = await createResource({ copyCount: 2 });
      const issue = (copy) => as(librarian.token).post('/loans/issue', {
        userIdentifier: 'REG/CIRC/0001', copyIdentifier: copy.barcode,
      });

      const first = (await issue(copies[0])).body.data.transactionId;
      const second = (await issue(copies[1])).body.data.transactionId;

      const timezone = await require('../../src/services/settings.service').getTimezone();
      const today = dayjs().tz(timezone).format('YYYYMMDD');
      expect(first).toMatch(new RegExp(`^LN-${today}-\\d{6}$`));
      expect(Number(second.slice(-6))).toBe(Number(first.slice(-6)) + 1);
    });

    it('restarts the counter each day and skips a code that is already taken', async () => {
      const { nextDailyCode } = require('../../src/services/sequence.service');
      const taken = new Set(['TS-20260102-000002']);
      const exists = async (code) => taken.has(code);

      expect(await nextDailyCode('TS', { date: new Date('2026-01-01T12:00:00Z'), exists })).toBe('TS-20260101-000001');
      expect(await nextDailyCode('TS', { date: new Date('2026-01-01T12:00:00Z'), exists })).toBe('TS-20260101-000002');
      expect(await nextDailyCode('TS', { date: new Date('2026-01-02T12:00:00Z'), exists })).toBe('TS-20260102-000001');
      expect(await nextDailyCode('TS', { date: new Date('2026-01-02T12:00:00Z'), exists })).toBe('TS-20260102-000003');
    });

    it('refuses to issue the same copy twice', async () => {
      const { copies } = await createResource({ copyCount: 1 });
      const other = await createUser('student', { registrationNumber: 'REG/CIRC/0002' });

      const first = await as(librarian.token).post('/loans/issue', {
        userIdentifier: 'REG/CIRC/0001',
        copyIdentifier: copies[0].barcode,
      });
      expect(first.status).toBe(201);

      const second = await as(librarian.token).post('/loans/issue', {
        userIdentifier: other.registrationNumber,
        copyIdentifier: copies[0].barcode,
      });
      expect(second.status).toBe(409);
      expect(await Loan.countDocuments({ copy: copies[0]._id, status: 'active' })).toBe(1);
    });

    it('enforces the borrowing limit for the role', async () => {
      const { copies } = await createResource({ copyCount: 5 });

      // The default student rule allows three items.
      for (let index = 0; index < 3; index += 1) {
        // eslint-disable-next-line no-await-in-loop
        const issued = await as(librarian.token).post('/loans/issue', {
          userIdentifier: 'REG/CIRC/0001',
          copyIdentifier: copies[index].barcode,
        });
        expect(issued.status).toBe(201);
      }

      const overLimit = await as(librarian.token).post('/loans/issue', {
        userIdentifier: 'REG/CIRC/0001',
        copyIdentifier: copies[3].barcode,
      });

      expect(overLimit.status).toBe(409);
      expect(overLimit.body.message).toMatch(/limit reached/i);
    });

    it('refuses to issue a reference-only title', async () => {
      const { copies } = await createResource({ copyCount: 1, isReferenceOnly: true, isBorrowable: false });

      const response = await as(librarian.token).post('/loans/issue', {
        userIdentifier: 'REG/CIRC/0001',
        copyIdentifier: copies[0].barcode,
      });

      expect(response.status).toBe(409);
      expect(response.body.message).toMatch(/reference-only|not available for loan/i);
    });

    it('refuses to issue to a suspended member', async () => {
      const { copies } = await createResource({ copyCount: 1 });
      const suspended = await createUser('student', { registrationNumber: 'REG/CIRC/SUSP', status: 'suspended' });

      const response = await as(librarian.token).post('/loans/issue', {
        userIdentifier: suspended.registrationNumber,
        copyIdentifier: copies[0].barcode,
      });

      expect(response.status).toBe(409);
      expect(response.body.message).toMatch(/suspended/i);
    });

    it('reports every blocker at once from the eligibility check', async () => {
      const response = await as(librarian.token).get('/loans/eligibility?userIdentifier=REG/CIRC/0001');

      expect(response.status).toBe(200);
      expect(response.body.data.eligible).toBe(true);
      expect(response.body.data.limits.maxBooks).toBe(3);
      expect(response.body.data.limits.loanPeriodDays).toBe(14);
    });

    it('does not let a student issue an item to themselves', async () => {
      const { copies } = await createResource({ copyCount: 1 });

      const response = await as(student.token).post('/loans/issue', {
        userIdentifier: 'REG/CIRC/0001',
        copyIdentifier: copies[0].barcode,
      });

      expect(response.status).toBe(403);
    });
  });

  describe('Workflow B — returning on time', () => {
    it('closes the loan, raises no fine and shelves the copy', async () => {
      const { resource, copies } = await createResource({ copyCount: 1 });
      await as(librarian.token).post('/loans/issue', {
        userIdentifier: 'REG/CIRC/0001',
        copyIdentifier: copies[0].barcode,
      });

      const response = await as(librarian.token).post('/loans/return', {
        copyIdentifier: copies[0].barcode,
        condition: 'good',
      });

      expect(response.status).toBe(200);
      expect(response.body.data.loan.status).toBe('returned');
      expect(response.body.data.fines).toHaveLength(0);
      expect(response.body.data.daysOverdue).toBe(0);
      expect(response.body.data.copyStatus).toBe('available');

      const refreshed = await Resource.findById(resource._id);
      expect(refreshed.availableCopies).toBe(1);
      expect(refreshed.borrowedCopies).toBe(0);
    });

    it('refuses to return the same loan twice', async () => {
      const { copies } = await createResource({ copyCount: 1 });
      await as(librarian.token).post('/loans/issue', {
        userIdentifier: 'REG/CIRC/0001',
        copyIdentifier: copies[0].barcode,
      });
      await as(librarian.token).post('/loans/return', { copyIdentifier: copies[0].barcode });

      const second = await as(librarian.token).post('/loans/return', { copyIdentifier: copies[0].barcode });
      expect(second.status).toBe(404);
    });
  });

  describe('Workflow C — returning late', () => {
    it('calculates the overdue days and raises a fine', async () => {
      const { copies } = await createResource({ copyCount: 1 });
      const issued = await as(librarian.token).post('/loans/issue', {
        userIdentifier: 'REG/CIRC/0001',
        copyIdentifier: copies[0].barcode,
      });

      // Backdate the due date by ten days to simulate a late return.
      await Loan.updateOne(
        { _id: issued.body.data.id },
        { $set: { dueDate: dayjs().subtract(10, 'day').toDate() } },
      );

      const response = await as(librarian.token).post('/loans/return', {
        copyIdentifier: copies[0].barcode,
        condition: 'good',
      });

      expect(response.status).toBe(200);
      expect(response.body.data.daysOverdue).toBe(10);
      expect(response.body.data.fines).toHaveLength(1);

      const fine = response.body.data.fines[0];
      expect(fine.fineType).toBe('overdue');
      // Ten days at the default 0.50/day.
      expect(fine.amount).toBeCloseTo(5, 2);

      const member = await User.findOne({ registrationNumber: 'REG/CIRC/0001' });
      expect(member.outstandingFineTotal).toBeCloseTo(5, 2);
    });

    it('caps the overdue fine at the policy maximum', async () => {
      const { copies } = await createResource({ copyCount: 1 });
      const issued = await as(librarian.token).post('/loans/issue', {
        userIdentifier: 'REG/CIRC/0001',
        copyIdentifier: copies[0].barcode,
      });

      // 400 days would be 200.00 without the 50.00 cap.
      await Loan.updateOne(
        { _id: issued.body.data.id },
        { $set: { dueDate: dayjs().subtract(400, 'day').toDate() } },
      );

      const response = await as(librarian.token).post('/loans/return', { copyIdentifier: copies[0].barcode });
      expect(response.body.data.fines[0].amount).toBeCloseTo(50, 2);
    });

    it('quarantines a copy returned damaged and charges for it', async () => {
      const { copies } = await createResource({ copyCount: 1 });
      await as(librarian.token).post('/loans/issue', {
        userIdentifier: 'REG/CIRC/0001',
        copyIdentifier: copies[0].barcode,
      });

      const response = await as(librarian.token).post('/loans/return', {
        copyIdentifier: copies[0].barcode,
        condition: 'damaged',
      });

      expect(response.status).toBe(200);
      expect(response.body.data.loan.status).toBe('damaged');
      expect(response.body.data.copyStatus).toBe('under_repair');
      expect(response.body.data.fines.some((fine) => fine.fineType === 'damaged')).toBe(true);
    });
  });

  describe('Renewals', () => {
    it('extends the due date and records the renewal', async () => {
      const { copies } = await createResource({ copyCount: 1 });
      const issued = await as(librarian.token).post('/loans/issue', {
        userIdentifier: 'REG/CIRC/0001',
        copyIdentifier: copies[0].barcode,
      });

      const response = await as(librarian.token).post(`/loans/${issued.body.data.id}/renew`, {});

      expect(response.status).toBe(200);
      expect(response.body.data.renewalCount).toBe(1);
      expect(dayjs(response.body.data.dueDate).isAfter(dayjs(issued.body.data.dueDate))).toBe(true);

      const detail = await as(librarian.token).get(`/loans/${issued.body.data.id}`);
      expect(detail.body.data.renewals).toHaveLength(1);
    });

    it('refuses to renew past the configured limit', async () => {
      const { copies } = await createResource({ copyCount: 1 });
      const issued = await as(librarian.token).post('/loans/issue', {
        userIdentifier: 'REG/CIRC/0001',
        copyIdentifier: copies[0].barcode,
      });

      // Students are allowed one renewal by default.
      const first = await as(librarian.token).post(`/loans/${issued.body.data.id}/renew`, {});
      expect(first.status).toBe(200);

      const second = await as(librarian.token).post(`/loans/${issued.body.data.id}/renew`, {});
      expect(second.status).toBe(409);
      expect(second.body.message).toMatch(/renewal limit/i);
    });

    it('refuses to renew while another member is waiting', async () => {
      const { resource, copies } = await createResource({ copyCount: 1 });
      const issued = await as(librarian.token).post('/loans/issue', {
        userIdentifier: 'REG/CIRC/0001',
        copyIdentifier: copies[0].barcode,
      });

      const waiting = await createAndSignIn('student', { registrationNumber: 'REG/CIRC/WAIT' });
      const hold = await as(waiting.token).post('/reservations', { resource: String(resource._id) });
      expect(hold.status).toBe(201);

      const renewal = await as(librarian.token).post(`/loans/${issued.body.data.id}/renew`, {});
      expect(renewal.status).toBe(409);
      expect(renewal.body.message).toMatch(/waiting/i);
    });
  });

  describe('Workflow E — lost items', () => {
    it('marks the copy lost and raises the replacement charge', async () => {
      const { copies } = await createResource({ copyCount: 1, replacementCost: 80 });
      const issued = await as(librarian.token).post('/loans/issue', {
        userIdentifier: 'REG/CIRC/0001',
        copyIdentifier: copies[0].barcode,
      });

      const response = await as(librarian.token).post(`/loans/${issued.body.data.id}/lost`, {
        reason: 'Reported lost by the borrower',
      });

      expect(response.status).toBe(200);
      expect(response.body.data.loan.status).toBe('lost');

      const lostFine = response.body.data.fines.find((fine) => fine.fineType === 'lost');
      expect(lostFine).toBeDefined();
      // Replacement cost 80 × the default multiplier of 1.
      expect(lostFine.amount).toBeCloseTo(80, 2);

      const copy = await ResourceCopy.findById(copies[0]._id);
      expect(copy.status).toBe('lost');
      expect(copy.currentLoan).toBeNull();
    });
  });

  describe('Workflow D — reservations', () => {
    it('refuses a hold while a copy is on the shelf', async () => {
      const { resource } = await createResource({ copyCount: 1 });

      const response = await as(student.token).post('/reservations', { resource: String(resource._id) });

      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(/on the shelf|borrowed immediately/i);
    });

    it('promotes the next reservation when a copy comes back', async () => {
      const { resource, copies } = await createResource({ copyCount: 1 });

      await as(librarian.token).post('/loans/issue', {
        userIdentifier: 'REG/CIRC/0001',
        copyIdentifier: copies[0].barcode,
      });

      const waiting = await createAndSignIn('student', { registrationNumber: 'REG/CIRC/QUEUE' });
      const hold = await as(waiting.token).post('/reservations', { resource: String(resource._id) });
      expect(hold.status).toBe(201);
      expect(hold.body.data.status).toBe('pending');

      const returned = await as(librarian.token).post('/loans/return', { copyIdentifier: copies[0].barcode });
      expect(returned.body.data.reservationPromoted).toBe(true);

      const updated = await as(waiting.token).get(`/reservations/${hold.body.data.id}`);
      expect(updated.body.data.status).toBe('ready');
      expect(updated.body.data.expiresAt).toBeTruthy();

      // The copy is held, not shelved.
      const copy = await ResourceCopy.findById(copies[0]._id);
      expect(copy.status).toBe('reserved');
    });

    it('only releases a held copy to the member it is held for', async () => {
      const { resource, copies } = await createResource({ copyCount: 1 });
      await as(librarian.token).post('/loans/issue', {
        userIdentifier: 'REG/CIRC/0001',
        copyIdentifier: copies[0].barcode,
      });

      const waiting = await createAndSignIn('student', { registrationNumber: 'REG/CIRC/HOLD' });
      await as(waiting.token).post('/reservations', { resource: String(resource._id) });
      await as(librarian.token).post('/loans/return', { copyIdentifier: copies[0].barcode });

      const other = await createUser('student', { registrationNumber: 'REG/CIRC/OTHER' });
      const wrongMember = await as(librarian.token).post('/loans/issue', {
        userIdentifier: other.registrationNumber,
        copyIdentifier: copies[0].barcode,
      });
      expect(wrongMember.status).toBe(409);
      expect(wrongMember.body.message).toMatch(/held for another member/i);

      const rightMember = await as(librarian.token).post('/loans/issue', {
        userIdentifier: 'REG/CIRC/HOLD',
        copyIdentifier: copies[0].barcode,
      });
      expect(rightMember.status).toBe(201);
    });

    it('stops a member holding the same title twice', async () => {
      const { resource, copies } = await createResource({ copyCount: 1 });
      await as(librarian.token).post('/loans/issue', {
        userIdentifier: 'REG/CIRC/0001',
        copyIdentifier: copies[0].barcode,
      });

      const waiting = await createAndSignIn('student', { registrationNumber: 'REG/CIRC/DUP' });
      const first = await as(waiting.token).post('/reservations', { resource: String(resource._id) });
      expect(first.status).toBe(201);

      const second = await as(waiting.token).post('/reservations', { resource: String(resource._id) });
      expect(second.status).toBe(409);
    });
  });

  describe('Overdue processing', () => {
    it('flags loans past their due date', async () => {
      const { copies } = await createResource({ copyCount: 1 });
      const issued = await as(librarian.token).post('/loans/issue', {
        userIdentifier: 'REG/CIRC/0001',
        copyIdentifier: copies[0].barcode,
      });

      await Loan.updateOne(
        { _id: issued.body.data.id },
        { $set: { dueDate: dayjs().subtract(3, 'day').toDate() } },
      );

      const { run } = require('../../src/jobs/overdue.job');
      const result = await run();

      expect(result.markedOverdue).toBeGreaterThanOrEqual(1);
      const loan = await Loan.findById(issued.body.data.id);
      expect(loan.status).toBe('overdue');
      expect(loan.daysOverdue).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Member self-service', () => {
    it('only shows a member their own loans', async () => {
      const { copies } = await createResource({ copyCount: 2 });
      const other = await createUser('student', { registrationNumber: 'REG/CIRC/PRIV' });

      await as(librarian.token).post('/loans/issue', {
        userIdentifier: 'REG/CIRC/0001',
        copyIdentifier: copies[0].barcode,
      });
      await as(librarian.token).post('/loans/issue', {
        userIdentifier: other.registrationNumber,
        copyIdentifier: copies[1].barcode,
      });

      // Asking for someone else's loans still returns only your own.
      const response = await as(student.token).get(`/loans?user=${other._id}`);

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].user.id).toBe(String(student.user.id));
    });
  });
});
