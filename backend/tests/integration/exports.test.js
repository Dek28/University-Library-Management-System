const {
  as, ensureRoles, ensureSettings, createUser, createAndSignIn,
  resetDatabase, models,
} = require('../helpers');
const { EXPORT_MAX_ROWS } = require('../../src/utils/query');
const { generateBarcode } = require('../../src/utils/identifiers');

const { User, Role } = models;

/** Comfortably past the 200-row interactive page cap. */
const COHORT = 260;

describe('Exports', () => {
  let admin;
  let totalUsers;

  beforeAll(async () => {
    await resetDatabase();
    const roles = await ensureRoles();
    await ensureSettings();
    admin = await createAndSignIn('admin');

    // insertMany rather than createUser: this suite only needs rows to count,
    // and 260 bcrypt hashes would dominate the runtime for no added coverage.
    const hashed = await User.findById(admin.user.id).select('+password');
    await User.insertMany(
      Array.from({ length: COHORT }, (unusedValue, index) => ({
        firstName: 'Cohort',
        lastName: `Member${index}`,
        email: `cohort.${index}@example.edu`,
        registrationNumber: `REG/EXP/${String(index).padStart(4, '0')}`,
        password: hashed.password,
        role: roles.student._id,
        status: 'active',
        barcode: generateBarcode('30'),
      })),
    );

    totalUsers = await User.countDocuments();
    expect(totalUsers).toBeGreaterThan(200);
  });

  afterAll(resetDatabase);

  /** Splits a CSV body into data rows, ignoring the header and BOM. */
  const csvRows = (body) => String(body)
    .replace(/^﻿/, '')
    .trim()
    .split('\n')
    .slice(1);

  it('exports every matching row, not just the first interactive page', async () => {
    const response = await as(admin.token).get('/users?format=csv');

    expect(response.status).toBe(200);
    expect(csvRows(response.text)).toHaveLength(totalUsers);
  });

  it('keeps the interactive endpoint capped at 200 however large a limit is asked for', async () => {
    // The page cap is enforced twice: the validator rejects an oversized limit
    // outright, and buildPagination clamps anything that reaches it.
    const rejected = await as(admin.token).get('/users?limit=5000');
    expect(rejected.status).toBe(422);

    const allowed = await as(admin.token).get('/users?limit=200');
    expect(allowed.status).toBe(200);
    expect(allowed.body.data).toHaveLength(200);
    expect(allowed.body.meta.total).toBe(totalUsers);

    const { buildPagination } = require('../../src/utils/query');
    expect(buildPagination({ limit: 5000 }).limit).toBe(200);
  });

  it('does not let the page size in the query shrink an export', async () => {
    const response = await as(admin.token).get('/users?format=csv&limit=20');

    expect(csvRows(response.text)).toHaveLength(totalUsers);
  });

  it('flags a truncated export instead of returning a short file silently', async () => {
    // Rather than seeding 10k rows, drop the ceiling for one call and assert
    // the honesty contract: a cut-short export must announce itself.
    const userService = require('../../src/services/user.service');
    const { items, total } = await userService.listUsers(
      { page: 1, limit: 10 },
      { maxLimit: 10 },
    );

    expect(items).toHaveLength(10);
    expect(total).toBe(totalUsers);
    expect(total).toBeGreaterThan(items.length);
  });

  it('applies the same ceiling to every export surface', async () => {
    for (const path of ['/users?format=csv', '/loans?format=csv', '/fines?format=csv']) {
      // eslint-disable-next-line no-await-in-loop
      const response = await as(admin.token).get(path);
      expect(response.status).toBe(200);
      expect(response.headers['x-export-truncated']).toBeUndefined();
    }
  });

  it('exposes a bounded ceiling so one request cannot pull an unbounded set', () => {
    expect(EXPORT_MAX_ROWS).toBeGreaterThan(200);
    expect(EXPORT_MAX_ROWS).toBeLessThanOrEqual(50000);
  });

  it('lets a cross-origin browser read the download filename and truncation flag', async () => {
    // Without these on Access-Control-Expose-Headers the browser hides them
    // from JavaScript, so the UI silently loses the filename and the warning.
    const response = await as(admin.token)
      .get('/users?format=csv')
      .set('Origin', 'http://localhost:5173');

    expect(response.status).toBe(200);
    const exposed = String(response.headers['access-control-expose-headers'] || '').toLowerCase();
    expect(exposed).toContain('content-disposition');
    expect(exposed).toContain('x-export-truncated');
  });
});
