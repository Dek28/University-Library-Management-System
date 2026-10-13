const request = require('supertest');
const {
  app, api, as, PASSWORD, ensureRoles, ensureSettings,
  createUser, createAndSignIn, resetDatabase, models,
} = require('../helpers');

describe('Authentication and authorization', () => {
  beforeAll(async () => {
    await resetDatabase();
    await ensureRoles();
    await ensureSettings();
  });

  afterAll(resetDatabase);

  describe('sign-in', () => {
    it('issues an access token and a refresh cookie for valid credentials', async () => {
      const user = await createUser('librarian');

      const response = await request(app)
        .post(api('/auth/login'))
        .send({ identifier: user.email, password: PASSWORD });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.accessToken).toEqual(expect.any(String));
      expect(response.body.data.user.email).toBe(user.email);
      expect(response.body.data.user.permissions).toEqual(expect.arrayContaining(['loan:issue']));

      const cookies = response.headers['set-cookie'] || [];
      expect(cookies.join(';')).toContain('ulms_rt=');
      expect(cookies.join(';')).toContain('HttpOnly');
    });

    it('accepts a registration number as the identifier', async () => {
      const student = await createUser('student', { registrationNumber: 'REG/AUTH/0001' });

      const response = await request(app)
        .post(api('/auth/login'))
        .send({ identifier: 'REG/AUTH/0001', password: PASSWORD });

      expect(response.status).toBe(200);
      expect(response.body.data.user.id).toBe(String(student._id));
    });

    it('never returns the password hash', async () => {
      const user = await createUser('student');
      const response = await request(app)
        .post(api('/auth/login'))
        .send({ identifier: user.email, password: PASSWORD });

      expect(response.body.data.user.password).toBeUndefined();
      expect(JSON.stringify(response.body)).not.toContain('$2a$');
    });

    it('rejects a wrong password with the same message as an unknown account', async () => {
      const user = await createUser('student');

      const wrongPassword = await request(app)
        .post(api('/auth/login'))
        .send({ identifier: user.email, password: 'NotThePassword1!' });
      const unknownAccount = await request(app)
        .post(api('/auth/login'))
        .send({ identifier: 'nobody@example.edu', password: 'NotThePassword1!' });

      expect(wrongPassword.status).toBe(401);
      expect(unknownAccount.status).toBe(401);
      // Identical responses stop an attacker enumerating valid accounts.
      expect(wrongPassword.body.message).toBe(unknownAccount.body.message);
    });

    it('refuses a suspended account', async () => {
      const user = await createUser('student', { status: 'suspended' });

      const response = await request(app)
        .post(api('/auth/login'))
        .send({ identifier: user.email, password: PASSWORD });

      expect(response.status).toBe(403);
      expect(response.body.message).toMatch(/suspended/i);
    });

    it('locks the account after repeated failures', async () => {
      const user = await createUser('student');

      for (let attempt = 0; attempt < 5; attempt += 1) {
        // eslint-disable-next-line no-await-in-loop
        await request(app).post(api('/auth/login')).send({ identifier: user.email, password: 'Wrong123!' });
      }

      const locked = await request(app)
        .post(api('/auth/login'))
        .send({ identifier: user.email, password: PASSWORD });

      expect(locked.status).toBe(403);
      expect(locked.body.message).toMatch(/locked/i);
    });
  });

  describe('sessions', () => {
    it('rotates the refresh token and rejects the old one', async () => {
      const user = await createUser('student');
      const login = await request(app).post(api('/auth/login')).send({ identifier: user.email, password: PASSWORD });
      const firstToken = login.body.data.refreshToken;

      const refreshed = await request(app).post(api('/auth/refresh')).send({ refreshToken: firstToken });
      expect(refreshed.status).toBe(200);
      expect(refreshed.body.data.refreshToken).not.toBe(firstToken);

      // Replaying a rotated token is treated as theft and kills every session.
      const replay = await request(app).post(api('/auth/refresh')).send({ refreshToken: firstToken });
      expect(replay.status).toBe(401);

      const afterRevocation = await request(app)
        .post(api('/auth/refresh'))
        .send({ refreshToken: refreshed.body.data.refreshToken });
      expect(afterRevocation.status).toBe(401);
    });

    it('invalidates existing access tokens when the password changes', async () => {
      const { user, token } = await createAndSignIn('student');

      const before = await as(token).get('/auth/me');
      expect(before.status).toBe(200);

      const change = await as(token).post('/auth/change-password', {
        currentPassword: PASSWORD,
        newPassword: 'BrandNewPass1!',
      });
      expect(change.status).toBe(200);

      const after = await as(token).get('/auth/me');
      expect(after.status).toBe(401);
    });

    it('rejects a malformed or absent token', async () => {
      expect((await request(app).get(api('/auth/me'))).status).toBe(401);
      expect((await as('not-a-real-token').get('/auth/me')).status).toBe(401);
    });
  });

  describe('password reset', () => {
    it('answers identically whether or not the address is registered', async () => {
      const user = await createUser('student');

      const known = await request(app).post(api('/auth/forgot-password')).send({ email: user.email });
      const unknown = await request(app).post(api('/auth/forgot-password')).send({ email: 'ghost@example.edu' });

      expect(known.status).toBe(200);
      expect(unknown.status).toBe(200);
      expect(known.body.message).toBe(unknown.body.message);
    });

    it('resets the password with a valid token and refuses an invalid one', async () => {
      const user = await createUser('student');
      const requested = await request(app).post(api('/auth/forgot-password')).send({ email: user.email });
      const token = requested.body.data.token;
      expect(token).toEqual(expect.any(String));

      const wrongToken = await request(app).post(api('/auth/reset-password'))
        .send({ email: user.email, token: 'x'.repeat(64), newPassword: 'AnotherPass1!' });
      expect(wrongToken.status).toBe(400);

      const reset = await request(app).post(api('/auth/reset-password'))
        .send({ email: user.email, token, newPassword: 'AnotherPass1!' });
      expect(reset.status).toBe(200);

      const signIn = await request(app).post(api('/auth/login'))
        .send({ identifier: user.email, password: 'AnotherPass1!' });
      expect(signIn.status).toBe(200);
    });
  });

  describe('role-based access control', () => {
    it('permits an action the role includes', async () => {
      const { token } = await createAndSignIn('librarian');
      const response = await as(token).get('/loans/desk-summary');
      expect(response.status).toBe(200);
    });

    it('refuses an action the role does not include', async () => {
      const { token } = await createAndSignIn('student');

      const auditLogs = await as(token).get('/audit-logs');
      const users = await as(token).get('/users');
      const adminDashboard = await as(token).get('/dashboard/admin');

      expect(auditLogs.status).toBe(403);
      expect(users.status).toBe(403);
      expect(adminDashboard.status).toBe(403);
    });

    it('stops a librarian reaching the administrator dashboard', async () => {
      const { token } = await createAndSignIn('librarian');
      expect((await as(token).get('/dashboard/admin')).status).toBe(403);
      expect((await as(token).get('/dashboard/librarian')).status).toBe(200);
    });

    it('prevents privilege escalation when creating an account', async () => {
      const { token } = await createAndSignIn('admin');
      const roles = await ensureRoles();

      const escalate = await as(token).post('/users', {
        firstName: 'Elevated',
        lastName: 'Account',
        email: 'elevated@example.edu',
        employeeId: 'EMP/ESCALATE',
        password: PASSWORD,
        role: String(roles.super_admin._id),
      });

      expect(escalate.status).toBe(403);
      expect(escalate.body.message).toMatch(/super administrator|authority level/i);
    });

    it('records successful and failed sign-ins in the audit trail', async () => {
      const user = await createUser('student');
      await request(app).post(api('/auth/login')).send({ identifier: user.email, password: PASSWORD });
      await request(app).post(api('/auth/login')).send({ identifier: user.email, password: 'Wrong123!' });

      const { token } = await createAndSignIn('super_admin');
      const logs = await as(token).get('/audit-logs?limit=100');

      const actions = logs.body.data.map((entry) => entry.action);
      expect(actions).toContain('login');
      expect(actions).toContain('login_failed');
    });
  });
});
