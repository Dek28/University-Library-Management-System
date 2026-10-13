const request = require('supertest');
const app = require('../src/app');
const env = require('../src/config/env');
const models = require('../src/models');
const { ROLE_DEFINITIONS } = require('../src/constants/permissions');
const { generateBarcode } = require('../src/utils/identifiers');

const {
  Role, User, Faculty, Department, Category, Publisher, Shelf, StudySpace,
  Author, Resource, ResourceCopy, Loan, Fine, Reservation, SystemSetting,
  Clearance, Notification, AuditLog, FinePayment, Renewal, DigitalResource, Counter,
} = models;

const api = (path) => `${env.apiPrefix}${path}`;

/** Ensures the role documents exist, refreshing their permission lists. */
async function ensureRoles() {
  const roles = {};
  for (const definition of ROLE_DEFINITIONS) {
    // eslint-disable-next-line no-await-in-loop
    roles[definition.key] = await Role.findOneAndUpdate(
      { key: definition.key },
      { $set: { ...definition, isSystem: true, isActive: true } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  }
  return roles;
}

async function ensureSettings(overrides = {}) {
  await SystemSetting.deleteMany({});
  const settings = await SystemSetting.create({ ...SystemSetting.defaults(), ...overrides });
  require('../src/services/settings.service').invalidate();
  return settings;
}

let sequence = 0;
const unique = (prefix) => {
  sequence += 1;
  return `${prefix}${Date.now().toString(36)}${sequence}`;
};

const PASSWORD = 'TestPass123!';

/** Creates a user with the given role key and returns the document. */
async function createUser(roleKey, overrides = {}) {
  const roles = await ensureRoles();
  const isStudent = roleKey === 'student';
  const tag = unique('u');

  return User.create({
    firstName: overrides.firstName || 'Test',
    lastName: overrides.lastName || roleKey,
    email: overrides.email || `${tag}@example.edu`,
    password: overrides.password || PASSWORD,
    role: roles[roleKey]._id,
    status: 'active',
    barcode: generateBarcode('30'),
    ...(isStudent
      ? { registrationNumber: overrides.registrationNumber || `REG/${tag.toUpperCase()}` }
      : { employeeId: overrides.employeeId || `EMP/${tag.toUpperCase()}` }),
    ...overrides,
  });
}

/** Signs a user in and returns { user, token, agent }. */
async function signIn(user, password = PASSWORD) {
  const response = await request(app)
    .post(api('/auth/login'))
    .send({ identifier: user.email, password });

  if (response.status !== 200) {
    throw new Error(`Sign-in failed for ${user.email}: ${response.status} ${response.body?.message}`);
  }
  return { token: response.body.data.accessToken, user: response.body.data.user };
}

/** Creates a user and signs them in, in one step. */
async function createAndSignIn(roleKey, overrides = {}) {
  const user = await createUser(roleKey, overrides);
  const session = await signIn(user);
  return { user, ...session };
}

/** Authenticated request helper: `as(token).get('/users')`. */
const as = (token) => {
  const wrap = (method) => (path, body) => {
    const req = request(app)[method](api(path)).set('Authorization', `Bearer ${token}`);
    return body === undefined ? req : req.send(body);
  };
  return {
    get: (path) => request(app).get(api(path)).set('Authorization', `Bearer ${token}`),
    post: wrap('post'),
    patch: wrap('patch'),
    put: wrap('put'),
    delete: (path) => request(app).delete(api(path)).set('Authorization', `Bearer ${token}`),
  };
};

/** Builds a catalogue title with `copyCount` available copies. */
async function createResource({ copyCount = 1, actor, ...overrides } = {}) {
  const faculty = await Faculty.findOneAndUpdate(
    { code: 'TFAC' },
    { $setOnInsert: { code: 'TFAC', name: 'Test Faculty' } },
    { upsert: true, new: true },
  );
  const department = await Department.findOneAndUpdate(
    { code: 'TDEP' },
    { $setOnInsert: { code: 'TDEP', name: 'Test Department', faculty: faculty._id } },
    { upsert: true, new: true },
  );
  const category = await Category.findOneAndUpdate(
    { name: 'Test Category' },
    { $setOnInsert: { name: 'Test Category' } },
    { upsert: true, new: true },
  );
  // Upserts skip document hooks, so the derived shelf name is set here.
  const shelf = await Shelf.findOneAndUpdate(
    { section: 'Testing', rack: 'T1' },
    { $setOnInsert: { section: 'Testing', rack: 'T1', name: Shelf.nameFor('Testing', 'T1') } },
    { upsert: true, new: true },
  );

  const resource = await Resource.create({
    title: overrides.title || `Test Title ${unique('t')}`,
    resourceType: overrides.resourceType || 'book',
    category: category._id,
    department: department._id,
    faculty: faculty._id,
    replacementCost: overrides.replacementCost ?? 50,
    isBorrowable: overrides.isBorrowable ?? true,
    isReferenceOnly: overrides.isReferenceOnly ?? false,
    createdBy: actor?._id,
    ...overrides,
  });

  const stub = String(resource._id).slice(-6).toUpperCase();
  const copies = await ResourceCopy.insertMany(
    Array.from({ length: copyCount }, (unusedValue, index) => ({
      resource: resource._id,
      // Kept distinct from generated (all-digit) numbers so tests never collide with the counter.
      accessionNumber: `T-${stub}-${String(index + 1).padStart(3, '0')}`,
      barcode: generateBarcode('20'),
      shelf: shelf._id,
      status: 'available',
      condition: 'good',
      replacementCost: resource.replacementCost,
    })),
  );

  await require('../src/services/resource.service').syncAvailability(resource._id);
  return { resource: await Resource.findById(resource._id), copies, department, faculty, category, shelf };
}

async function createStudySpace(overrides = {}) {
  return StudySpace.create({
    name: overrides.name || `Room ${unique('r')}`,
    spaceType: 'room',
    capacity: overrides.capacity ?? 10,
    isActive: true,
    ...overrides,
  });
}

/** Wipes every collection between test files. */
async function resetDatabase() {
  await Promise.all([
    User.deleteMany({}), Role.deleteMany({}), Resource.deleteMany({}), ResourceCopy.deleteMany({}),
    Loan.deleteMany({}), Fine.deleteMany({}), FinePayment.deleteMany({}), Renewal.deleteMany({}),
    Reservation.deleteMany({}), Clearance.deleteMany({}), Notification.deleteMany({}),
    DigitalResource.deleteMany({}), StudySpace.deleteMany({}),
    Faculty.deleteMany({}), Department.deleteMany({}), Category.deleteMany({}),
    Publisher.deleteMany({}), Shelf.deleteMany({}), Author.deleteMany({}), Counter.deleteMany({}),
    // Audit entries are immutable through Mongoose by design, so test cleanup
    // goes through the driver directly rather than weakening that guarantee.
    AuditLog.collection.deleteMany({}),
  ]);
  require('../src/services/settings.service').invalidate();
  require('../src/middleware/auth').invalidateRoleCache();
}

module.exports = {
  app, api, as, PASSWORD, models,
  ensureRoles, ensureSettings, createUser, signIn, createAndSignIn,
  createResource, createStudySpace, resetDatabase, unique,
};
