const { connectDatabase, disconnectDatabase } = require('../src/config/database');
const settingsService = require('../src/services/settings.service');
const { invalidateRoleCache } = require('../src/middleware/auth');

// One connection for the whole file; Jest runs suites serially (`--runInBand`).
beforeAll(async () => {
  await connectDatabase();
});

afterAll(async () => {
  await disconnectDatabase();
});

// Caches are process-local, so they must not leak between test files.
afterEach(() => {
  settingsService.invalidate();
  invalidateRoleCache();
});

jest.setTimeout(60000);
