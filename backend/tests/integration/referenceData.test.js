const {
  as, ensureRoles, ensureSettings, createAndSignIn, resetDatabase, models,
} = require('../helpers');

const { Category, Shelf } = models;

describe('Reference data', () => {
  let admin;

  beforeAll(async () => {
    await resetDatabase();
    await ensureRoles();
    await ensureSettings();
    admin = await createAndSignIn('super_admin');
  });

  afterAll(resetDatabase);

  describe('collections without a code', () => {
    it.each(['categories', 'publishers', 'subjects', 'languages', 'study-spaces'])(
      'creates %s by name alone and ignores any code sent',
      async (collection) => {
        const first = await as(admin.token).post(`/reference/${collection}`, { name: `First ${collection}` });
        const second = await as(admin.token).post(`/reference/${collection}`, { name: `Second ${collection}`, code: 'IGNORED' });

        expect(first.status).toBe(201);
        expect(second.status).toBe(201);
        expect(first.body.data.code).toBeUndefined();
        expect(second.body.data.code).toBeUndefined();
      },
    );

    it.each(['categories', 'languages', 'subjects'])('stores no description for %s', async (collection) => {
      const response = await as(admin.token).post(`/reference/${collection}`, { name: `Described ${collection}`, description: 'Ignored' });

      expect(response.status).toBe(201);
      expect(response.body.data.description).toBeUndefined();
    });

    it('still requires a name', async () => {
      const response = await as(admin.token).post('/reference/categories', {});
      expect(response.status).toBe(422);
      expect(await Category.countDocuments({ name: { $exists: false } })).toBe(0);
    });

    it('keeps the code for faculties', async () => {
      const withCode = await as(admin.token).post('/reference/faculties', { code: 'FX', name: 'Faculty X' });
      const withoutCode = await as(admin.token).post('/reference/faculties', { name: 'Faculty Y' });

      expect(withCode.status).toBe(201);
      expect(withCode.body.data.code).toBe('FX');
      expect(withoutCode.status).toBe(422);
    });
  });

  describe('shelves', () => {
    it('is defined by section and rack, with a name derived from them', async () => {
      const response = await as(admin.token).post('/reference/shelves', {
        section: 'Computing', rack: 'R1', name: 'Ignored', code: 'IGNORED', description: 'Ignored',
      });

      expect(response.status).toBe(201);
      expect(response.body.data).toMatchObject({ section: 'Computing', rack: 'R1', name: 'Computing · Rack R1' });
      expect(response.body.data.code).toBeUndefined();
      expect(response.body.data.description).toBeUndefined();
    });

    it('does not repeat "Rack" when the rack number already includes it', async () => {
      const response = await as(admin.token).post('/reference/shelves', { section: 'Health', rack: 'Rack 4' });
      expect(response.body.data.name).toBe('Health · Rack 4');
    });

    it('requires both a section and a rack', async () => {
      const noRack = await as(admin.token).post('/reference/shelves', { section: 'Computing' });
      const noSection = await as(admin.token).post('/reference/shelves', { rack: 'R9' });

      expect(noRack.status).toBe(400);
      expect(noSection.status).toBe(400);
      expect(noRack.body.message).toMatch(/section name and a rack number/i);
    });

    it('refuses the same section and rack twice, ignoring case', async () => {
      await as(admin.token).post('/reference/shelves', { section: 'Sciences', rack: 'R1' });
      const duplicate = await as(admin.token).post('/reference/shelves', { section: 'sciences', rack: 'r1' });

      expect(duplicate.status).toBe(409);
      expect(await Shelf.countDocuments({ section: /^sciences$/i })).toBe(1);
    });

    it('renames the shelf when its section or rack changes', async () => {
      const created = await as(admin.token).post('/reference/shelves', { section: 'Reference', rack: 'R1' });
      const updated = await as(admin.token).patch(`/reference/shelves/${created.body.data.id}`, { rack: 'R2' });

      expect(updated.status).toBe(200);
      expect(updated.body.data.name).toBe('Reference · Rack R2');
    });

    it('lets an older shelf without a section be deactivated', async () => {
      const legacy = await Shelf.create({ name: 'Nursing-A' });
      const response = await as(admin.token).patch(`/reference/shelves/${legacy._id}`, { isActive: false });

      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({ name: 'Nursing-A', isActive: false });
    });
  });
});
