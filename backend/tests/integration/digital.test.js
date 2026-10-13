const path = require('path');
const fs = require('fs/promises');
const request = require('supertest');
const {
  app, api, as, ensureRoles, ensureSettings, createAndSignIn, resetDatabase, models,
} = require('../helpers');
const env = require('../../src/config/env');

const { DigitalResource } = models;

/** A tiny but structurally valid PDF, enough for upload and streaming. */
const PDF_BYTES = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n'
  + '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n'
  + '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n'
  + 'trailer<</Root 1 0 R>>\n%%EOF\n',
  'utf-8',
);

describe('Digital repository access control', () => {
  let librarian;
  let lecturer;
  let student;
  let admin;
  const uploadedKeys = [];

  beforeAll(async () => {
    await resetDatabase();
    await ensureRoles();
    await ensureSettings();
    librarian = await createAndSignIn('librarian');
    lecturer = await createAndSignIn('lecturer');
    student = await createAndSignIn('student', { registrationNumber: 'REG/DIG/0001' });
    admin = await createAndSignIn('super_admin');
  });

  afterAll(async () => {
    // Remove any file this suite wrote to the upload directory.
    for (const key of uploadedKeys) {
      // eslint-disable-next-line no-await-in-loop
      await fs.unlink(path.resolve(env.storage.localRoot, key)).catch(() => {});
    }
    await resetDatabase();
  });

  /** Uploads a document at the given access level and returns the record. */
  const upload = async (token, accessLevel, title = `Item ${accessLevel}`) => {
    const response = await request(app)
      .post(api('/digital-resources'))
      .set('Authorization', `Bearer ${token}`)
      .field('title', title)
      .field('resourceType', 'thesis')
      .field('accessLevel', accessLevel)
      .field('year', '2026')
      .field('keywords', 'testing,repository')
      .attach('file', PDF_BYTES, { filename: `${accessLevel}.pdf`, contentType: 'application/pdf' });

    expect(response.status).toBe(201);

    const stored = await DigitalResource.findById(response.body.data.id).select('+storageKey');
    uploadedKeys.push(stored.storageKey);
    return response.body.data;
  };

  describe('upload', () => {
    it('stores a document with its metadata', async () => {
      const item = await upload(librarian.token, 'university', 'A repository thesis');

      expect(item.title).toBe('A repository thesis');
      expect(item.mimeType).toBe('application/pdf');
      expect(item.fileSize).toBeGreaterThan(0);
      expect(item.keywords).toEqual(['testing', 'repository']);
      // The storage location is never exposed to a client.
      expect(item.storageKey).toBeUndefined();
    });

    it('rejects a file type that is not permitted', async () => {
      const response = await request(app)
        .post(api('/digital-resources'))
        .set('Authorization', `Bearer ${librarian.token}`)
        .field('title', 'Executable')
        .field('resourceType', 'report')
        .attach('file', Buffer.from('MZ binary'), { filename: 'payload.exe', contentType: 'application/x-msdownload' });

      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(/unsupported file type/i);
    });

    it('rejects a file whose extension contradicts its content type', async () => {
      const response = await request(app)
        .post(api('/digital-resources'))
        .set('Authorization', `Bearer ${librarian.token}`)
        .field('title', 'Disguised')
        .field('resourceType', 'report')
        .attach('file', PDF_BYTES, { filename: 'payload.exe', contentType: 'application/pdf' });

      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(/does not match/i);
    });

    it('does not let a student upload', async () => {
      const response = await request(app)
        .post(api('/digital-resources'))
        .set('Authorization', `Bearer ${student.token}`)
        .field('title', 'Student upload')
        .field('resourceType', 'thesis')
        .attach('file', PDF_BYTES, { filename: 'x.pdf', contentType: 'application/pdf' });

      expect(response.status).toBe(403);
    });
  });

  describe('Workflow H — access levels', () => {
    it('lets an authorised member open and download an item', async () => {
      const item = await upload(librarian.token, 'university');

      const detail = await as(student.token).get(`/digital-resources/${item.id}`);
      expect(detail.status).toBe(200);

      const download = await as(student.token).get(`/digital-resources/${item.id}/download`);
      expect(download.status).toBe(200);
      expect(download.headers['content-type']).toBe('application/pdf');
      expect(download.headers['cache-control']).toMatch(/no-store/);
    });

    it('hides a staff-only item from students, by listing and by direct id', async () => {
      const item = await upload(librarian.token, 'staff', 'Staff only paper');

      const listing = await as(student.token).get('/digital-resources?limit=100');
      expect(listing.body.data.map((entry) => entry.title)).not.toContain('Staff only paper');

      // A guessed id is indistinguishable from a missing record.
      const direct = await as(student.token).get(`/digital-resources/${item.id}`);
      expect(direct.status).toBe(404);

      const download = await as(student.token).get(`/digital-resources/${item.id}/download`);
      expect(download.status).toBe(404);
    });

    it('lets academic staff reach a staff-only item', async () => {
      const item = await upload(librarian.token, 'staff');

      const detail = await as(lecturer.token).get(`/digital-resources/${item.id}`);
      expect(detail.status).toBe(200);
    });

    it('hides a students-only item from academic staff', async () => {
      const item = await upload(librarian.token, 'students');

      const detail = await as(lecturer.token).get(`/digital-resources/${item.id}`);
      expect(detail.status).toBe(404);
    });

    it('keeps a restricted item away from everyone but administrators', async () => {
      const item = await upload(admin.token, 'restricted', 'Restricted record');

      expect((await as(student.token).get(`/digital-resources/${item.id}`)).status).toBe(404);
      expect((await as(lecturer.token).get(`/digital-resources/${item.id}`)).status).toBe(404);
      expect((await as(admin.token).get(`/digital-resources/${item.id}`)).status).toBe(200);
    });

    it('refuses a download when the item is marked read-only', async () => {
      const item = await upload(librarian.token, 'university');
      await as(librarian.token).patch(`/digital-resources/${item.id}`, { isDownloadable: false });

      const response = await as(student.token).get(`/digital-resources/${item.id}/download`);

      expect(response.status).toBe(403);
      expect(response.body.message).toMatch(/reading only/i);
    });

    it('requires authentication for every repository route', async () => {
      const item = await upload(librarian.token, 'public');

      expect((await request(app).get(api('/digital-resources'))).status).toBe(401);
      expect((await request(app).get(api(`/digital-resources/${item.id}/download`))).status).toBe(401);
    });

    it('lets a member read an item on the platform without counting a download', async () => {
      const item = await upload(librarian.token, 'university');

      const response = await as(student.token).get(`/digital-resources/${item.id}/read`);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.headers['content-disposition']).toMatch(/^inline;/);
      expect(response.headers['cache-control']).toMatch(/no-store/);
      expect((await DigitalResource.findById(item.id)).downloadCount).toBe(0);

      const logs = await as(admin.token).get('/audit-logs?action=digital_read');
      expect(logs.body.data.some((log) => log.entityLabel === item.title)).toBe(true);
    });

    it('still allows reading when downloads are switched off', async () => {
      const item = await upload(librarian.token, 'university');
      await as(librarian.token).patch(`/digital-resources/${item.id}`, { isDownloadable: false });

      expect((await as(student.token).get(`/digital-resources/${item.id}/read`)).status).toBe(200);
      expect((await as(student.token).get(`/digital-resources/${item.id}/download`)).status).toBe(403);
    });

    it('applies the same access rules to reading as to downloading', async () => {
      const item = await upload(librarian.token, 'staff');

      expect((await as(student.token).get(`/digital-resources/${item.id}/read`)).status).toBe(404);
      expect((await request(app).get(api(`/digital-resources/${item.id}/read`))).status).toBe(401);
    });

    it('audits each download', async () => {
      const item = await upload(librarian.token, 'university');
      await as(student.token).get(`/digital-resources/${item.id}/download`);

      const logs = await as(admin.token).get('/audit-logs?action=digital_downloaded');
      expect(logs.body.data.length).toBeGreaterThanOrEqual(1);
      expect(logs.body.data[0].entityLabel).toBeTruthy();
    });
  });
});
