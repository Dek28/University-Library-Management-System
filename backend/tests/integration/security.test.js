const path = require('path');
const request = require('supertest');
const dayjs = require('dayjs');
const ExcelJS = require('exceljs');
const {
  app, api, as, ensureRoles, ensureSettings, createUser, createAndSignIn,
  createResource, createStudySpace, resetDatabase, models,
} = require('../helpers');
const { buildPagination } = require('../../src/utils/query');
const localDriver = require('../../src/services/storage/local.driver');

const {
  User, Role, Loan, Fine, FinePayment, AuditLog, ReadingGroup, ReadingGroupSession, ReadingGroupAttendance,
} = models;

describe('Security and integrity', () => {
  let superAdmin;
  let admin;
  let librarian;

  beforeAll(async () => {
    await resetDatabase();
    await ensureRoles();
    await ensureSettings();
    superAdmin = await createAndSignIn('super_admin');
    admin = await createAndSignIn('admin');
    librarian = await createAndSignIn('librarian');
  });

  afterAll(resetDatabase);

  describe('user administration authority', () => {
    it('stops an administrator editing a super administrator', async () => {
      const victim = await createUser('super_admin');

      const response = await as(admin.token).patch(`/users/${victim._id}`, { email: 'attacker@example.edu' });

      expect(response.status).toBe(403);
      expect((await User.findById(victim._id)).email).toBe(victim.email);
    });

    it('stops an administrator deleting a super administrator', async () => {
      const victim = await createUser('super_admin');

      const response = await as(admin.token).delete(`/users/${victim._id}`);

      expect(response.status).toBe(403);
      expect(await User.findById(victim._id)).not.toBeNull();
    });

    it('still lets an administrator edit and delete a lower-ranked account', async () => {
      const target = await createUser('student', { registrationNumber: 'REG/SEC/EDIT' });

      const edit = await as(admin.token).patch(`/users/${target._id}`, { phone: '+255700000001' });
      expect(edit.status).toBe(200);

      const removal = await as(admin.token).delete(`/users/${target._id}`);
      expect(removal.status).toBe(200);
    });

    it('lets a member update their own editable profile fields', async () => {
      const member = await createAndSignIn('student', { registrationNumber: 'REG/SEC/SELF' });

      const response = await as(member.token).patch('/users/me/profile', { phone: '+255700000002', gender: 'female' });

      expect(response.status).toBe(200);
      expect(response.body.data.phone).toBe('+255700000002');
    });

    it('validates the values in a self-service profile update', async () => {
      const member = await createAndSignIn('student', { registrationNumber: 'REG/SEC/VAL' });

      const badGender = await as(member.token).patch('/users/me/profile', { gender: 'banana' });
      const longPhone = await as(member.token).patch('/users/me/profile', { phone: '7'.repeat(40) });

      expect(badGender.status).toBe(422);
      expect(longPhone.status).toBe(422);
    });
  });

  describe('sign-in and password reset', () => {
    it('does not let a password reset re-activate a deactivated account', async () => {
      const user = await createUser('student', { registrationNumber: 'REG/SEC/INACT', status: 'inactive' });

      const forgot = await request(app).post(api('/auth/forgot-password')).send({ email: user.email });
      const token = forgot.body.data?.code;
      expect(token).toEqual(expect.any(String));

      const reset = await request(app)
        .post(api('/auth/reset-password'))
        .send({ email: user.email, code: token, newPassword: 'FreshPassw0rd' });
      expect(reset.status).toBe(200);

      const login = await request(app).post(api('/auth/login')).send({ identifier: user.email, password: 'FreshPassw0rd' });
      expect(login.status).toBe(403);
      expect((await User.findById(user._id)).status).toBe('inactive');
    });

    it('does not write a mistyped password into the audit log', async () => {
      const typed = 'Mistyped#Secret9word';
      const response = await request(app).post(api('/auth/login')).send({ identifier: typed, password: 'whatever' });
      expect(response.status).toBe(401);

      const [entry] = await AuditLog.collection.find({ action: 'login_failed' }).sort({ createdAt: -1 }).limit(1).toArray();
      expect(JSON.stringify(entry)).not.toContain(typed);
    });

    it('records the connection address, not a spoofed forwarding header', async () => {
      await request(app)
        .post(api('/auth/login'))
        .set('X-Forwarded-For', '203.0.113.99')
        .send({ identifier: 'nobody@example.edu', password: 'whatever' });

      const [entry] = await AuditLog.collection.find({ action: 'login_failed' }).sort({ createdAt: -1 }).limit(1).toArray();
      expect(entry.ipAddress).not.toContain('203.0.113.99');
    });

    it('keeps angle brackets in a password instead of silently stripping them', async () => {
      const created = await as(superAdmin.token).post('/users', {
        firstName: 'Bracket', lastName: 'Tester', email: 'bracket@example.edu', role: 'student',
        registrationNumber: 'REG/SEC/BRACKET', password: 'Pa<ss>word1', mustChangePassword: false,
      });
      expect(created.status).toBe(201);

      const exact = await request(app).post(api('/auth/login')).send({ identifier: 'bracket@example.edu', password: 'Pa<ss>word1' });
      const stripped = await request(app).post(api('/auth/login')).send({ identifier: 'bracket@example.edu', password: 'Password1' });

      expect(exact.status).toBe(200);
      expect(stripped.status).toBe(401);
    });

    it('refuses a request from an origin that is not allowed with 403, not a server error', async () => {
      const response = await request(app).get('/health').set('Origin', 'https://evil.example');

      expect(response.status).toBe(403);
    });
  });

  describe('reading group privacy', () => {
    let member;
    let outsider;
    let session;

    beforeAll(async () => {
      member = await createAndSignIn('student', { registrationNumber: 'REG/SEC/GRPA' });
      outsider = await createAndSignIn('student', { registrationNumber: 'REG/SEC/GRPB' });
      const space = await createStudySpace({ name: 'Privacy Room' });

      const group = await as(librarian.token).post('/reading-groups', {
        name: 'Private Circle', readingTopic: 'Topic', leader: String(member.user.id),
        members: [String(member.user.id)], maxMembers: 10, status: 'active',
      });
      expect(group.status).toBe(201);

      const scheduled = await as(librarian.token).post('/reading-groups/sessions', {
        group: group.body.data.id, space: String(space._id), sessionDate: dayjs().add(1, 'day').format('YYYY-MM-DD'),
        startTime: '09:00', endTime: '10:00', topic: 'Session',
      });
      expect(scheduled.status).toBe(201);
      session = scheduled.body.data;
    });

    afterAll(() => Promise.all([
      ReadingGroupAttendance.deleteMany({}), ReadingGroupSession.deleteMany({}), ReadingGroup.deleteMany({}),
    ]));

    it('hides a session, and its member list, from someone outside the group', async () => {
      const response = await as(outsider.token).get(`/reading-groups/sessions/${session.id}`);

      expect(response.status).toBe(403);
    });

    it('leaves other groups out of a member session listing', async () => {
      const response = await as(outsider.token).get('/reading-groups/sessions');

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(0);
    });

    it('still shows a session to a member of its group', async () => {
      const detail = await as(member.token).get(`/reading-groups/sessions/${session.id}`);
      const listing = await as(member.token).get('/reading-groups/sessions');

      expect(detail.status).toBe(200);
      expect(listing.body.data).toHaveLength(1);
    });
  });

  describe('concurrent circulation and payments', () => {
    it('lets one of two simultaneous returns succeed and raises a single fine', async () => {
      const { copies } = await createResource({ copyCount: 1 });
      await createUser('student', { registrationNumber: 'REG/SEC/RET' });
      const issued = await as(librarian.token).post('/loans/issue', {
        userIdentifier: 'REG/SEC/RET', copyIdentifier: copies[0].barcode,
      });
      expect(issued.status).toBe(201);
      await Loan.updateOne({ _id: issued.body.data.id }, { $set: { dueDate: dayjs().subtract(10, 'day').toDate() } });

      const giveBack = () => as(librarian.token).post('/loans/return', { loanId: issued.body.data.id, condition: 'good' });
      const results = await Promise.all([giveBack(), giveBack()]);

      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      results.filter((r) => r.status !== 200).forEach((r) => expect([404, 409]).toContain(r.status));
      expect(await Fine.countDocuments({ loan: issued.body.data.id })).toBe(1);
    });

    it('records one payment when two simultaneous payments clear the same fine', async () => {
      const member = await createUser('student', { registrationNumber: 'REG/SEC/PAY' });
      const fine = await as(librarian.token).post('/fines', {
        user: String(member._id), fineType: 'administrative', amount: 20, reason: 'Concurrency test charge',
      });
      expect(fine.status).toBe(201);

      const pay = () => as(librarian.token).post(`/fines/${fine.body.data.id}/payments`, { amount: 20, method: 'cash' });
      const results = await Promise.all([pay(), pay()]);

      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      expect(await FinePayment.countDocuments({ fine: fine.body.data.id, kind: 'payment' })).toBe(1);
      expect((await Fine.findById(fine.body.data.id)).amountPaid).toBe(20);
    });
  });

  describe('role management', () => {
    let deskLead;
    let juniorRoleId;

    beforeAll(async () => {
      const created = await as(superAdmin.token).post('/roles', {
        key: 'desk_lead', name: 'Desk lead', level: 70, permissions: ['role:view', 'role:manage'],
      });
      expect(created.status).toBe(201);

      const junior = await as(superAdmin.token).post('/roles', {
        key: 'desk_junior', name: 'Desk junior', level: 10, permissions: ['role:view'],
      });
      juniorRoleId = junior.body.data.id;

      const role = await Role.findOne({ key: 'desk_lead' });
      deskLead = await createUser('librarian', { role: role._id, employeeId: 'EMP/SEC/LEAD' });
      deskLead = { user: deskLead, ...(await require('../helpers').signIn(deskLead)) };
    });

    it('refuses to grant a permission the role manager does not hold', async () => {
      const response = await as(deskLead.token).post('/roles', {
        key: 'sneaky_role', name: 'Sneaky', level: 10, permissions: ['setting:manage'],
      });

      expect(response.status).toBe(403);
    });

    it('refuses to raise a role to the manager own authority level', async () => {
      const response = await as(deskLead.token).patch(`/roles/${juniorRoleId}`, { level: 70 });

      expect(response.status).toBe(403);
    });

    it('still lets the role manager create a role limited to permissions they hold', async () => {
      const response = await as(deskLead.token).post('/roles', {
        key: 'allowed_role', name: 'Allowed', level: 10, permissions: ['role:view'],
      });

      expect(response.status).toBe(201);
    });
  });

  describe('settings and storage paths', () => {
    it('rejects a logo location that is not an uploaded logo', async () => {
      const response = await as(superAdmin.token).patch('/settings', { institution: { logoUrl: '../../secret.png' } });

      expect(response.status).toBe(422);
    });

    it('accepts an uploaded logo location and clearing the logo', async () => {
      const set = await as(superAdmin.token).patch('/settings', { institution: { logoUrl: '/uploads/logos/institution.png' } });
      const cleared = await as(superAdmin.token).patch('/settings', { institution: { logoUrl: null } });

      expect(set.status).toBe(200);
      expect(cleared.status).toBe(200);
    });

    it('refuses a storage key that escapes the upload folder through a sibling path', () => {
      const sibling = `../${path.basename(localDriver.root)}-sibling/secret.txt`;
      let outcome;
      try {
        outcome = localDriver.stream(sibling);
        outcome.on('error', () => {});
        outcome.destroy();
      } catch (error) {
        outcome = error;
      }

      expect(outcome).toBeInstanceOf(Error);
    });

    it('ignores a sort field that is a credential column', () => {
      expect(buildPagination({ sort: 'password' }, { defaultSort: '-createdAt' }).sort).toBe('-createdAt');
      expect(buildPagination({ sort: '-passwordResetTokenHash' }, { defaultSort: '-createdAt' }).sort).toBe('-createdAt');
      expect(buildPagination({ sort: 'lastName' }, { defaultSort: '-createdAt' }).sort).toBe('lastName');
    });
  });

  describe('bulk user import', () => {
    it('takes the default password from the form body, not the URL', async () => {
      const book = new ExcelJS.Workbook();
      const sheet = book.addWorksheet('Students');
      sheet.addRow(['registrationNumber', 'firstName', 'lastName', 'email']);
      sheet.addRow(['REG/SEC/IMPORT1', 'Imported', 'Student', 'imported.student@example.edu']);
      const buffer = Buffer.from(await book.xlsx.writeBuffer());

      const response = await request(app)
        .post(api('/users/import'))
        .set('Authorization', `Bearer ${admin.token}`)
        .field('defaultPassword', 'ImportPassw0rd')
        .field('roleKey', 'student')
        .attach('file', buffer, {
          filename: 'students.xlsx',
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });

      expect(response.status).toBe(200);
      expect(response.body.data.imported).toBe(1);
    });
  });
});
