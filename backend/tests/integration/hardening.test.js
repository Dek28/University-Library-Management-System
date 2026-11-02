const request = require('supertest');
const {
  app, api, as, PASSWORD, ensureRoles, ensureSettings, createUser, createAndSignIn, createResource,
  resetDatabase, models,
} = require('../helpers');
const env = require('../../src/config/env');
const { hashToken } = require('../../src/utils/identifiers');
const { errorHandler } = require('../../src/middleware/error');

const { User, Notification, Fine } = models;

const FAKE_ID = '507f1f77bcf86cd799439011';

/** Every route the app registers, with its full path and whether `authenticate` guards it. */
function listRoutes() {
  const { authenticate } = require('../../src/middleware/auth');
  const found = [];

  const mountPath = (layer) => layer.regexp.source
    .replace(/^\^/, '')
    .replace(/\\\/\?\(\?=\\\/\|\$\)$/, '')
    .replace(/\\\//g, '/');

  const walk = (stack, prefix, guarded) => {
    let isGuarded = guarded;
    stack.forEach((layer) => {
      if (layer.route) {
        found.push({
          methods: Object.keys(layer.route.methods),
          path: `${prefix}${layer.route.path}`,
          guarded: isGuarded || layer.route.stack.some((s) => s.handle === authenticate),
        });
      } else if (layer.name === 'router') {
        walk(layer.handle.stack, prefix + mountPath(layer), isGuarded);
      } else if (layer.handle === authenticate) {
        isGuarded = true;
      }
    });
  };

  walk(app._router.stack, '', false);
  return found;
}

describe('Authentication coverage', () => {
  const PUBLIC_PATHS = new Set([
    '/health', '/api-docs.json', `${env.apiPrefix}/`,
    `${env.apiPrefix}/auth/login`, `${env.apiPrefix}/auth/refresh`, `${env.apiPrefix}/auth/logout`,
    `${env.apiPrefix}/auth/forgot-password`, `${env.apiPrefix}/auth/reset-password`,
    `${env.apiPrefix}/settings/public`,
  ]);

  it('leaves only the intended endpoints open to anonymous callers', () => {
    const open = listRoutes().filter((r) => !r.guarded).map((r) => r.path);

    expect(open.length).toBeGreaterThan(0);
    open.forEach((path) => expect(PUBLIC_PATHS.has(path)).toBe(true));
  });

  it('answers 401 on every protected route when no token is sent', async () => {
    const protectedRoutes = listRoutes().filter((r) => r.guarded);
    expect(protectedRoutes.length).toBeGreaterThan(100);

    const failures = [];
    for (const route of protectedRoutes) {
      const url = route.path.replace(/:\w+/g, FAKE_ID);
      for (const method of route.methods) {
        // eslint-disable-next-line no-await-in-loop
        const response = await request(app)[method](url);
        if (response.status !== 401) failures.push(`${method.toUpperCase()} ${route.path} -> ${response.status}`);
      }
    }

    expect(failures).toEqual([]);
  });

  it('rejects a token signed with the wrong key, an expired token and a refresh-typed token', async () => {
    const jwt = require('jsonwebtoken');
    const user = await createUser('student');
    const claims = { sub: String(user._id), pwd: 0 };

    const forged = jwt.sign({ ...claims, type: 'access' }, 'not-the-real-secret');
    const expired = jwt.sign({ ...claims, type: 'access' }, env.jwt.accessSecret, { expiresIn: -10 });
    const wrongType = jwt.sign({ ...claims, type: 'refresh' }, env.jwt.accessSecret);
    const noneAlg = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ ...claims, type: 'access' })).toString('base64url')}.`;

    for (const token of [forged, expired, wrongType, noneAlg]) {
      // eslint-disable-next-line no-await-in-loop
      const response = await as(token).get('/auth/me');
      expect(response.status).toBe(401);
    }
  });
});

describe('Hardening', () => {
  let admin;
  let librarian;
  let alice;
  let bob;

  beforeAll(async () => {
    await resetDatabase();
    await ensureRoles();
    await ensureSettings();
    admin = await createAndSignIn('super_admin');
    librarian = await createAndSignIn('librarian');
    alice = await createAndSignIn('student', { registrationNumber: 'REG/HARD/ALICE' });
    bob = await createAndSignIn('student', { registrationNumber: 'REG/HARD/BOB' });
  });

  afterAll(resetDatabase);

  describe('access to another member\'s records', () => {
    let bobLoan;
    let bobFine;
    let bobNotification;

    beforeAll(async () => {
      const { copies } = await createResource({ copyCount: 1 });
      const issued = await as(librarian.token).post('/loans/issue', {
        userIdentifier: 'REG/HARD/BOB', copyIdentifier: copies[0].barcode,
      });
      expect(issued.status).toBe(201);
      bobLoan = issued.body.data;

      const fine = await as(admin.token).post('/fines', {
        user: String(bob.user.id), fineType: 'damaged', amount: 5, reason: 'Water damage to cover',
      });
      expect(fine.status).toBe(201);
      bobFine = fine.body.data;

      bobNotification = await Notification.create({
        user: bob.user.id, type: 'system', title: 'Private', message: 'For Bob only',
      });
    });

    it('refuses to show a loan or its receipt to a different member', async () => {
      expect((await as(alice.token).get(`/loans/${bobLoan.id}`)).status).toBe(403);
      expect((await as(alice.token).get(`/loans/${bobLoan.id}/receipt`)).status).toBe(403);
      expect((await as(bob.token).get(`/loans/${bobLoan.id}`)).status).toBe(200);
    });

    it('ignores a user filter that points at someone else', async () => {
      const response = await as(alice.token).get(`/loans?user=${bob.user.id}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(0);
    });

    it('refuses to show a fine, its statement or its payments to a different member', async () => {
      expect((await as(alice.token).get(`/fines/${bobFine.id}`)).status).toBe(403);
      expect((await as(alice.token).get(`/fines/${bobFine.id}/receipt`)).status).toBe(403);

      const list = await as(alice.token).get(`/fines?user=${bob.user.id}`);
      expect(list.body.data).toHaveLength(0);
      const payments = await as(alice.token).get(`/fines/payments?user=${bob.user.id}`);
      expect(payments.body.data).toHaveLength(0);
    });

    it('refuses to let a member pay, waive or cancel a fine', async () => {
      expect((await as(bob.token).post(`/fines/${bobFine.id}/payments`, { amount: 5, method: 'cash' })).status).toBe(403);
      expect((await as(bob.token).post(`/fines/${bobFine.id}/waive`, { reason: 'please' })).status).toBe(403);
      expect((await as(bob.token).post(`/fines/${bobFine.id}/cancel`, { reason: 'please' })).status).toBe(403);
      expect((await Fine.findById(bobFine.id)).status).not.toBe('paid');
    });

    it('does not let a member read, renew or delete another member\'s data', async () => {
      const renew = await as(alice.token).post(`/loans/${bobLoan.id}/renew`, {});
      expect([403, 404]).toContain(renew.status);

      const removed = await as(alice.token).delete(`/notifications/${bobNotification.id}`);
      expect([403, 404]).toContain(removed.status);
      expect(await Notification.findById(bobNotification.id)).not.toBeNull();

      expect((await as(alice.token).get(`/users/${bob.user.id}`)).status).toBe(403);
      expect((await as(alice.token).patch(`/users/${bob.user.id}`, { firstName: 'Hacked' })).status).toBe(403);
    });

    it('does not expose another member\'s clearance record', async () => {
      expect((await as(alice.token).get(`/clearance/${FAKE_ID}`)).status).toBe(403);
      expect((await as(alice.token).get('/clearance')).status).toBe(403);
    });
  });

  describe('privilege escalation', () => {
    it('ignores role, status and permission fields in a self-service profile update', async () => {
      const response = await as(alice.token).patch('/users/me/profile', {
        phone: '+255700000000', role: 'super_admin', status: 'suspended', permissions: ['*'], isDeleted: true,
      });
      expect(response.status).toBeLessThan(500);

      const stored = await User.findById(alice.user.id).populate('role');
      expect(stored.role.key).toBe('student');
      expect(stored.status).toBe('active');
      expect(stored.isDeleted).toBeFalsy();
    });

    it('does not let a student create users, change roles or read the audit log', async () => {
      expect((await as(alice.token).post('/users', {
        firstName: 'Eve', lastName: 'Evil', email: 'eve@example.edu', role: 'super_admin', password: 'Passw0rd!Long',
      })).status).toBe(403);
      expect((await as(alice.token).get('/roles')).status).toBe(403);
      expect((await as(alice.token).get('/audit-logs')).status).toBe(403);
      expect((await as(alice.token).get('/reports/overview')).status).toBe(403);
    });
  });

  describe('operator injection', () => {
    it('rejects an object where sign-in expects a string', async () => {
      const response = await request(app).post(api('/auth/login')).send({ identifier: { $gt: '' }, password: { $gt: '' } });

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
      expect(response.body.data?.accessToken).toBeUndefined();
    });

    it('rejects an object where a password reset expects an email or token', async () => {
      const forgot = await request(app).post(api('/auth/forgot-password')).send({ email: { $ne: null } });
      expect(forgot.status).toBe(422);

      const reset = await request(app).post(api('/auth/reset-password'))
        .send({ email: alice.user.email, code: { $ne: null }, newPassword: 'Another#Passw0rd' });
      expect(reset.status).toBe(422);
    });

    it('does not let query operators widen a member\'s own listing', async () => {
      const response = await request(app)
        .get(api('/loans?user[$ne]=000000000000000000000000'))
        .set('Authorization', `Bearer ${alice.token}`);

      expect(response.status).toBeLessThan(500);
      if (response.status === 200) expect(response.body.data).toHaveLength(0);
    });

    it('treats regex metacharacters in a search as plain text', async () => {
      const response = await as(admin.token).get('/resources?search=' + encodeURIComponent('(a+)+$'));

      expect(response.status).toBe(200);
    });
  });

  describe('password reset', () => {
    const requestReset = (email) => request(app).post(api('/auth/forgot-password')).send({ email });
    const submitReset = (body) => request(app).post(api('/auth/reset-password')).send(body);

    it('answers the same way for a known and an unknown address', async () => {
      const known = await requestReset(alice.user.email);
      const unknown = await requestReset('nobody-here@example.edu');

      expect(known.status).toBe(unknown.status);
      expect(known.body.message).toBe(unknown.body.message);
    });

    it('stores only a hash of the token and keeps it valid for at most 30 minutes', async () => {
      const response = await requestReset(alice.user.email);
      const token = response.body.data.code;

      const stored = await User.findById(alice.user.id).select('+passwordResetTokenHash +passwordResetExpiresAt');
      expect(token).toMatch(/^\d{6}$/);
      expect(stored.passwordResetTokenHash).toBe(hashToken(`${alice.user.id}:${token}`));
      expect(stored.passwordResetTokenHash).not.toBe(token);

      const lifetime = stored.passwordResetExpiresAt.getTime() - Date.now();
      expect(lifetime).toBeLessThanOrEqual(30 * 60 * 1000);
      expect(lifetime).toBeGreaterThan(0);
    });

    it('refuses an expired token', async () => {
      const token = (await requestReset(alice.user.email)).body.data.code;
      await User.updateOne({ _id: alice.user.id }, { $set: { passwordResetExpiresAt: new Date(Date.now() - 1000) } });

      const response = await submitReset({ email: alice.user.email, code: token, newPassword: 'Expired#Passw0rd' });

      expect(response.status).toBe(400);
    });

    it('refuses a token that was already used', async () => {
      const carol = await createUser('student', { registrationNumber: 'REG/HARD/CAROL' });
      const token = (await requestReset(carol.email)).body.data.code;

      const first = await submitReset({ email: carol.email, code: token, newPassword: 'First#Passw0rd1' });
      const second = await submitReset({ email: carol.email, code: token, newPassword: 'Second#Passw0rd2' });

      expect(first.status).toBe(200);
      expect(second.status).toBe(400);

      const login = await request(app).post(api('/auth/login')).send({ identifier: carol.email, password: 'First#Passw0rd1' });
      expect(login.status).toBe(200);
    });

    it('refuses a token presented with a different account\'s email', async () => {
      const dave = await createUser('student', { registrationNumber: 'REG/HARD/DAVE' });
      const token = (await requestReset(dave.email)).body.data.code;

      const response = await submitReset({ email: bob.user.email, code: token, newPassword: 'Hijack#Passw0rd1' });

      expect(response.status).toBe(400);
    });

    it('invalidates an earlier token when a new one is requested', async () => {
      const erin = await createUser('student', { registrationNumber: 'REG/HARD/ERIN' });
      const older = (await requestReset(erin.email)).body.data.code;
      const newer = (await requestReset(erin.email)).body.data.code;

      expect((await submitReset({ email: erin.email, code: older, newPassword: 'Older#Passw0rd1' })).status).toBe(400);
      expect((await submitReset({ email: erin.email, code: newer, newPassword: 'Newer#Passw0rd1' })).status).toBe(200);
    });

    it('emails the code to the account address and nowhere else', async () => {
      const { outbox } = require('../../src/services/mail.service');
      outbox.length = 0;
      const ivan = await createUser('student', { registrationNumber: 'REG/HARD/IVAN' });

      const response = await requestReset(ivan.email);
      await requestReset('nobody-at-all@example.edu');

      expect(outbox).toHaveLength(1);
      expect(outbox[0].to).toBe(ivan.email);
      expect(outbox[0].text).toContain(response.body.data.code);
      expect(outbox[0].text).toMatch(/expires in \d+ minutes/);
    });

    it('locks the code after too many wrong guesses, even if the right one follows', async () => {
      const judy = await createUser('student', { registrationNumber: 'REG/HARD/JUDY' });
      const code = (await requestReset(judy.email)).body.data.code;
      const wrong = code === '000000' ? '111111' : '000000';

      for (let i = 0; i < env.security.passwordResetMaxAttempts; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        expect((await submitReset({ email: judy.email, code: wrong, newPassword: 'Guess#Passw0rd1' })).status).toBe(400);
      }

      const late = await submitReset({ email: judy.email, code, newPassword: 'Judy#Passw0rd1' });
      expect(late.status).toBe(400);
    });

    it('rejects a code that is not six digits', async () => {
      for (const code of ['12345', '1234567', 'abcdef', '12 345']) {
        // eslint-disable-next-line no-await-in-loop
        const response = await submitReset({ email: alice.user.email, code, newPassword: 'Whatever#Passw0rd1' });
        expect(response.status).toBe(422);
      }
    });

    it('does not send a second code within the resend interval', async () => {
      const { outbox } = require('../../src/services/mail.service');
      const kate = await createUser('student', { registrationNumber: 'REG/HARD/KATE' });
      const original = env.security.passwordResetResendSeconds;
      env.security.passwordResetResendSeconds = 60;
      outbox.length = 0;
      try {
        const first = await requestReset(kate.email);
        const second = await requestReset(kate.email);

        expect(first.status).toBe(200);
        expect(second.status).toBe(200);
        expect(second.body.message).toBe(first.body.message);
        expect(outbox).toHaveLength(1);
      } finally {
        env.security.passwordResetResendSeconds = original;
      }
    });

    it('signs out every existing session once the password is reset', async () => {
      const frank = await createAndSignIn('student', { registrationNumber: 'REG/HARD/FRANK' });
      const login = await request(app).post(api('/auth/login')).send({ identifier: frank.user.email, password: PASSWORD });
      const refreshToken = login.body.data.refreshToken;

      const token = (await requestReset(frank.user.email)).body.data.code;
      await submitReset({ email: frank.user.email, code: token, newPassword: 'Frank#Passw0rd1' });

      expect((await as(frank.token).get('/auth/me')).status).toBe(401);
      const refresh = await request(app).post(api('/auth/refresh')).send({ refreshToken });
      expect(refresh.status).toBe(401);
    });

    it('does not reveal the token in the response when development secrets are off', async () => {
      const original = env.exposeDevSecrets;
      env.exposeDevSecrets = false;
      try {
        const response = await requestReset(alice.user.email);
        expect(response.status).toBe(200);
        expect(response.body.data).toBeNull();
        expect(JSON.stringify(response.body)).not.toMatch(/\d{6}/);
      } finally {
        env.exposeDevSecrets = original;
      }
    });
  });

  describe('sessions', () => {
    it('rejects the old access token and refresh token after a password change', async () => {
      const gina = await createAndSignIn('student', { registrationNumber: 'REG/HARD/GINA' });
      const login = await request(app).post(api('/auth/login')).send({ identifier: gina.user.email, password: PASSWORD });

      const change = await as(login.body.data.accessToken).post('/auth/change-password', {
        currentPassword: PASSWORD, newPassword: 'Gina#NewPassw0rd1',
      });
      expect(change.status).toBe(200);

      expect((await as(login.body.data.accessToken).get('/auth/me')).status).toBe(401);
      const refresh = await request(app).post(api('/auth/refresh')).send({ refreshToken: login.body.data.refreshToken });
      expect(refresh.status).toBe(401);
    });

    it('revokes the whole session family when a rotated refresh token is replayed', async () => {
      const hank = await createUser('student', { registrationNumber: 'REG/HARD/HANK' });
      const login = await request(app).post(api('/auth/login')).send({ identifier: hank.email, password: PASSWORD });
      const stolen = login.body.data.refreshToken;

      const rotated = await request(app).post(api('/auth/refresh')).send({ refreshToken: stolen });
      expect(rotated.status).toBe(200);

      const replay = await request(app).post(api('/auth/refresh')).send({ refreshToken: stolen });
      expect(replay.status).toBe(401);

      const legitimate = await request(app).post(api('/auth/refresh')).send({ refreshToken: rotated.body.data.refreshToken });
      expect(legitimate.status).toBe(401);
    });

    it('marks the refresh cookie HTTP-only and scoped to the site', async () => {
      const response = await request(app)
        .post(api('/auth/login'))
        .send({ identifier: alice.user.email, password: PASSWORD });
      const cookie = response.headers['set-cookie'].find((c) => c.startsWith(`${env.jwt.refreshCookieName}=`));

      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=(Lax|Strict)/i);
      expect(cookie).toMatch(/Path=\//);
    });
  });

  describe('uploads', () => {
    it('rejects a file whose bytes do not match the declared type', async () => {
      const html = Buffer.from('<html><script>alert(1)</script></html>');
      const response = await request(app)
        .post(api('/digital-resources'))
        .set('Authorization', `Bearer ${librarian.token}`)
        .field('title', 'Disguised page')
        .field('resourceType', 'report')
        .attach('file', html, { filename: 'report.pdf', contentType: 'application/pdf' });

      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(/content does not match/i);
    });

    it('rejects an image upload that is really a script', async () => {
      const response = await request(app)
        .post(api('/settings/logo'))
        .set('Authorization', `Bearer ${admin.token}`)
        .attach('logo', Buffer.from('<?php system($_GET["c"]); ?>'), { filename: 'logo.png', contentType: 'image/png' });

      expect(response.status).toBe(400);
    });

    it('rejects an empty file', async () => {
      const response = await request(app)
        .post(api('/digital-resources'))
        .set('Authorization', `Bearer ${librarian.token}`)
        .field('title', 'Empty')
        .field('resourceType', 'report')
        .attach('file', Buffer.alloc(0), { filename: 'empty.pdf', contentType: 'application/pdf' });

      expect(response.status).toBe(400);
    });
  });

  describe('errors and headers', () => {
    it('returns a JSON 404 without a stack trace for an unknown route', async () => {
      const response = await as(admin.token).get('/does-not-exist');

      expect(response.status).toBe(404);
      expect(response.body.stack).toBeUndefined();
    });

    it('returns 400 for malformed JSON', async () => {
      const response = await request(app).post(api('/auth/login')).set('Content-Type', 'application/json').send('{"identifier":');

      expect(response.status).toBe(400);
    });

    it('reports an unexpected failure without internals when development secrets are off', () => {
      const original = env.exposeDevSecrets;
      env.exposeDevSecrets = false;
      const res = { statusCode: null, payload: null, status(code) { this.statusCode = code; return this; }, json(body) { this.payload = body; return this; } };
      const req = { method: 'GET', originalUrl: '/api/v1/loans?token=secret', clientIp: '203.0.113.5' };

      try {
        errorHandler(new Error('MongoServerError: connection to db.internal:27017 failed'), req, res, () => {});
      } finally {
        env.exposeDevSecrets = original;
      }

      expect(res.statusCode).toBe(500);
      expect(res.payload.message).toBe('Internal server error');
      expect(res.payload.stack).toBeUndefined();
      expect(JSON.stringify(res.payload)).not.toMatch(/mongo|db\.internal/i);
    });

    it('sends hardening headers and hides the framework', async () => {
      const response = await request(app).get('/health');

      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-powered-by']).toBeUndefined();
      expect(response.headers['strict-transport-security']).toBeDefined();
      expect(response.headers['x-frame-options']).toBeDefined();
    });

    it('answers a preflight only for an allowed origin', async () => {
      const allowed = env.cors.origins[0];
      const ok = await request(app).options(api('/auth/login')).set('Origin', allowed).set('Access-Control-Request-Method', 'POST');
      expect(ok.headers['access-control-allow-origin']).toBe(allowed);

      const bad = await request(app).options(api('/auth/login')).set('Origin', 'https://evil.example').set('Access-Control-Request-Method', 'POST');
      expect(bad.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('production configuration', () => {
    const baseline = {
      NODE_ENV: 'production',
      JWT_ACCESS_SECRET: 'a'.repeat(64),
      JWT_REFRESH_SECRET: 'b'.repeat(64),
      CORS_ORIGINS: 'https://library.example.edu',
      FRONTEND_URL: 'https://library.example.edu',
      COOKIE_SECURE: 'true',
    };

    const load = (overrides) => {
      const saved = { ...process.env };
      Object.assign(process.env, baseline, overrides);
      try {
        let loaded;
        jest.isolateModules(() => { loaded = require('../../src/config/env'); });
        return loaded;
      } finally {
        Object.keys(process.env).forEach((key) => { if (!(key in saved)) delete process.env[key]; });
        Object.assign(process.env, saved);
      }
    };

    it('starts with a complete production configuration', () => {
      const loaded = load({});

      expect(loaded.isProd).toBe(true);
      expect(loaded.exposeDevSecrets).toBe(false);
    });

    it('refuses to start with insecure cookies or a wildcard CORS origin', () => {
      expect(() => load({ COOKIE_SECURE: 'false' })).toThrow(/COOKIE_SECURE/);
      expect(() => load({ CORS_ORIGINS: '*' })).toThrow(/wildcard/i);
    });

    it('refuses to start with a placeholder secret', () => {
      expect(() => load({ JWT_ACCESS_SECRET: 'change-me-in-production-use-a-64-char-random-string-xx' })).toThrow(/insecure secrets/);
    });
  });
});

describe('Notification integrity', () => {
  beforeAll(async () => {
    await resetDatabase();
    await ensureRoles();
  });

  afterAll(resetDatabase);

  it('stores every notification that has no de-duplication key', async () => {
    const { notify } = require('../../src/services/notification.service');
    const user = await createUser('student', { registrationNumber: 'REG/NOTE/0001' });

    const results = [];
    for (let i = 0; i < 3; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      results.push(await notify({ user: user._id, type: 'system', title: `Notice ${i}`, message: 'Hello' }));
    }

    expect(results.every(Boolean)).toBe(true);
    expect(await Notification.countDocuments({ user: user._id })).toBe(3);
  });

  it('still refuses to send the same keyed reminder twice', async () => {
    const { notify } = require('../../src/services/notification.service');
    const user = await createUser('student', { registrationNumber: 'REG/NOTE/0002' });
    const payload = { user: user._id, type: 'due_soon', title: 'Due soon', message: 'Tomorrow', dedupeKey: 'due_soon:test:2026-01-01' };

    expect(await notify(payload)).toBeTruthy();
    expect(await notify(payload)).toBeNull();
    expect(await Notification.countDocuments({ user: user._id })).toBe(1);
  });
});

describe('Rate limiting', () => {
  let member;
  let staffToken;

  beforeAll(async () => {
    await resetDatabase();
    await ensureRoles();
    await ensureSettings();
    member = await createUser('student', { registrationNumber: 'REG/RATE/0001' });
    // Signed in before the limiters are switched on, so later tests can still call the API.
    staffToken = (await createAndSignIn('librarian')).token;
    env.security.enforceRateLimitsInTest = true;
  });

  afterAll(async () => {
    env.security.enforceRateLimitsInTest = false;
    await resetDatabase();
  });

  it('does not count successful sign-ins, so a busy campus address is not locked out', async () => {
    for (let i = 0; i < env.security.authRateLimitMax + 5; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const response = await request(app).post(api('/auth/login')).send({ identifier: member.email, password: PASSWORD });
      expect(response.status).toBe(200);
    }
  });

  it('blocks repeated failed sign-ins from one address with 429', async () => {
    const statuses = [];
    for (let i = 0; i < env.security.authRateLimitMax + 3; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const response = await request(app).post(api('/auth/login')).send({ identifier: `ghost${i}@example.edu`, password: 'wrong-password' });
      statuses.push(response.status);
    }

    expect(statuses.slice(0, env.security.authRateLimitMax).every((s) => s === 401)).toBe(true);
    expect(statuses.slice(env.security.authRateLimitMax)).toEqual([429, 429, 429]);
  });

  it('limits password reset requests', async () => {
    const statuses = [];
    for (let i = 0; i < env.security.authRateLimitMax + 2; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const response = await request(app).post(api('/auth/forgot-password')).send({ email: `ghost${i}@example.edu` });
      statuses.push(response.status);
    }

    expect(statuses[0]).toBe(200);
    expect(statuses[statuses.length - 1]).toBe(429);
  });

  it('limits report and export requests separately from ordinary reads', async () => {
    const token = staffToken;

    const ordinary = await as(token).get('/loans');
    expect(ordinary.status).toBe(200);

    let limited = 0;
    for (let i = 0; i < 35; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const response = await as(token).get('/loans?format=csv');
      if (response.status === 429) limited += 1;
    }

    expect(limited).toBeGreaterThan(0);
    expect((await as(token).get('/loans')).status).toBe(200);
  });
});
