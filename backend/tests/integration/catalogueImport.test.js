const request = require('supertest');
const ExcelJS = require('exceljs');
const {
  app, api, as, ensureRoles, ensureSettings, createAndSignIn, createResource, resetDatabase, models,
} = require('../helpers');

const {
  Resource, ResourceCopy, Category, Language, Subject, Shelf, Author, Publisher,
} = models;

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Builds an .xlsx buffer from a header row and data rows. */
async function workbook(headers, rows) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Sheet1');
  sheet.addRow(headers);
  rows.forEach((row) => sheet.addRow(row));
  return Buffer.from(await book.xlsx.writeBuffer());
}

const binary = (req) => req.buffer(true).parse((res, cb) => {
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
});

describe('Bulk catalogue import', () => {
  let librarian;
  let admin;
  let student;
  let lecturer;
  let shelf;

  const upload = (token, path, buffer, fields = {}, filename = 'books.xlsx', type = XLSX) => {
    let req = request(app).post(api(path)).set('Authorization', `Bearer ${token}`)
      .attach('file', buffer, { filename, contentType: type });
    Object.entries(fields).forEach(([key, value]) => {
      req = req.field(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
    });
    return req;
  };

  // A supplier's sheet: headings differ from the form's labels but mean the same fields.
  const SUPPLIER_HEADERS = [
    'Book Title', 'Author', 'ISBN-13', 'Year Published', 'Edition', 'Publisher', 'Category',
    'Shelf Location', 'Qty', 'Price', 'Reference Only', 'Remarks',
  ];

  beforeAll(async () => {
    await resetDatabase();
    await ensureRoles();
    await ensureSettings();
    librarian = await createAndSignIn('librarian');
    admin = await createAndSignIn('admin');
    student = await createAndSignIn('student', { registrationNumber: 'REG/IMP/0001' });
    lecturer = await createAndSignIn('lecturer');
    ({ shelf } = await createResource({ copyCount: 0 }));
  });

  afterAll(resetDatabase);

  beforeEach(async () => {
    await Promise.all([
      Resource.deleteMany({ title: /^Import / }),
      Category.deleteMany({ name: { $in: ['Computer Science', 'Mathematics'] } }),
      Language.deleteMany({ name: 'Swahili' }),
      Subject.deleteMany({ name: 'Algorithms' }),
    ]);
    await Category.create({ name: 'Computer Science' });
  });

  it('matches supplier headings to the catalogue form fields', async () => {
    const file = await workbook(SUPPLIER_HEADERS, [
      ['Import Algorithms', 'Thomas Cormen', '978-0262033848', 2009, 'Third Edition', 'MIT Press', 'Computer Science', Shelf.labelOf(shelf), 2, '$80.00', 'No', 'Classic text'],
    ]);
    const response = await upload(librarian.token, '/resources/import/inspect', file);
    expect(response.status).toBe(200);

    const { mapping, columns, totalRows } = response.body.data;
    expect(totalRows).toBe(1);
    const fieldFor = (heading) => mapping[columns.find((c) => c.header === heading).column];
    expect(fieldFor('Book Title')).toBe('title');
    expect(fieldFor('Author')).toBe('authors');
    expect(fieldFor('ISBN-13')).toBe('isbn');
    expect(fieldFor('Year Published')).toBe('publicationYear');
    expect(fieldFor('Shelf Location')).toBe('shelf');
    expect(fieldFor('Qty')).toBe('copies');
    expect(fieldFor('Price')).toBe('purchasePrice');
    expect(fieldFor('Reference Only')).toBe('isReferenceOnly');
    expect(fieldFor('Remarks')).toBeUndefined();
  });

  it('validates without writing anything on a dry run', async () => {
    const file = await workbook(SUPPLIER_HEADERS, [
      ['Import Dry Run', 'Jane Doe', '', 2020, '1', 'Dry Press', 'Computer Science', '', 1, '10', 'No', ''],
      ['', 'No Title', '', 'not a year', '', '', 'Unknown Category', 'Nowhere', 'lots', '', 'maybe', ''],
    ]);
    const response = await upload(librarian.token, '/resources/import', file, { dryRun: true });
    expect(response.status).toBe(200);
    expect(response.body.data.imported).toBe(1);
    expect(response.body.data.skipped).toBe(1);

    const [problemRow] = response.body.data.errors;
    expect(problemRow.row).toBe(3);
    expect(problemRow.problems.join(' | ')).toMatch(/Title is empty/);
    expect(problemRow.problems.join(' | ')).toMatch(/Category "Unknown Category" does not exist/);
    expect(problemRow.problems.join(' | ')).toMatch(/Shelf "Nowhere" does not exist/);

    expect(await Resource.countDocuments({ title: 'Import Dry Run' })).toBe(0);
    expect(await Publisher.countDocuments({ name: 'Dry Press' })).toBe(0);
  });

  it('creates each book with every mapped field filled, plus its copies', async () => {
    const file = await workbook(SUPPLIER_HEADERS, [
      ['Import Algorithms', 'Thomas Cormen; Charles Leiserson', '978-0262033848', 2009, 'Third Edition', 'MIT Press', 'computer science', Shelf.labelOf(shelf), 3, '$80.00', 'No', 'Classic text'],
      ['Import Second Book', 'Ada Lovelace', '', '2015-06-01', '2', '', '', '', '', '', 'Yes', ''],
    ]);
    const response = await upload(admin.token, '/resources/import', file);
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ imported: 2, skipped: 0, copiesCreated: 3 });

    const book = await Resource.findOne({ title: 'Import Algorithms' }).populate('authors category publisher');
    expect(book.isbn).toBe('9780262033848');
    expect(book.publicationYear).toBe(2009);
    expect(book.edition).toBe('3rd');
    expect(book.publisher.name).toBe('MIT Press');
    expect(book.category.name).toBe('Computer Science');
    expect(String(book.shelf)).toBe(String(shelf._id));
    expect(book.authors.map((a) => a.fullName)).toEqual(['Thomas Cormen', 'Charles Leiserson']);
    expect(book.purchasePrice).toBe(80);
    expect(book.isReferenceOnly).toBe(false);
    expect(book.totalCopies).toBe(3);
    expect(await ResourceCopy.countDocuments({ resource: book._id, shelf: shelf._id })).toBe(3);

    const second = await Resource.findOne({ title: 'Import Second Book' });
    expect(second.publicationYear).toBe(2015);
    expect(second.edition).toBe('2nd');
    expect(second.isReferenceOnly).toBe(true);
    expect(await Author.countDocuments({ fullName: 'Ada Lovelace' })).toBe(1);
  });

  it('skips a book whose ISBN is already catalogued and imports the rest', async () => {
    await Resource.create({ title: 'Import Existing', resourceType: 'book', isbn: '9780131103627' });
    const file = await workbook(['Title', 'ISBN'], [
      ['Import Duplicate', '978-0-13-110362-7'],
      ['Import Fresh', ''],
    ]);
    const response = await upload(librarian.token, '/resources/import', file);
    expect(response.body.data.imported).toBe(1);
    expect(response.body.data.errors[0].problems[0]).toMatch(/already in the catalogue/);
  });

  it('uses a mapping chosen on screen, and can create missing reference data', async () => {
    const file = await workbook(['Col A', 'Col B', 'Col C', 'Col D'], [
      ['Import Mapped', 'Mathematics', 'Swahili', 'Algorithms; Graphs'],
    ]);
    const mapping = {
      1: 'title', 2: 'category', 3: 'language', 4: 'subjects',
    };

    const refused = await upload(librarian.token, '/resources/import', file, { mapping });
    expect(refused.body.data.imported).toBe(0);

    const response = await upload(librarian.token, '/resources/import', file, { mapping, createMissing: true });
    expect(response.body.data.imported).toBe(1);
    expect(response.body.data.newReferences.categories).toEqual(['Mathematics']);

    const book = await Resource.findOne({ title: 'Import Mapped' }).populate('category language subjects');
    expect(book.category.name).toBe('Mathematics');
    expect(book.language.name).toBe('Swahili');
    expect(book.subjects.map((s) => s.name).sort()).toEqual(['Algorithms', 'Graphs']);
  });

  it('refuses a mapping without a title column', async () => {
    const file = await workbook(['Something'], [['x']]);
    const response = await upload(librarian.token, '/resources/import', file, { mapping: { 1: 'isbn' } });
    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/Title/);
  });

  it('reads CSV files, including ones Windows uploads as an Excel type', async () => {
    const csv = Buffer.from('Title,Authors,ISBN,Edition\n"Import CSV Book","Grace Hopper","0131103628","3rd"\n');
    const response = await upload(librarian.token, '/resources/import', csv, {}, 'books.csv', 'application/vnd.ms-excel');
    expect(response.status).toBe(200);
    expect(response.body.data.imported).toBe(1);
    const book = await Resource.findOne({ title: 'Import CSV Book' });
    expect(book.isbn).toBe('0131103628');
    expect(book.edition).toBe('3rd');
  });

  it('serves a template headed with the form labels that imports as downloaded', async () => {
    const template = await binary(as(librarian.token).get('/resources/import/template'));
    expect(template.status).toBe(200);

    const book = new ExcelJS.Workbook();
    await book.xlsx.load(template.body);
    const headings = book.getWorksheet('Books').getRow(1).values.filter(Boolean);
    expect(headings).toEqual(expect.arrayContaining(['Title', 'Publication year', 'Shelf (location)', 'Number of copies']));

    const response = await upload(librarian.token, '/resources/import', template.body, { dryRun: true }, 'template.xlsx');
    expect(response.body.data).toMatchObject({ total: 1, imported: 1, skipped: 0 });
  });

  it('is available to librarians and admins only', async () => {
    const file = await workbook(['Title'], [['Import Forbidden']]);
    expect((await upload(student.token, '/resources/import', file)).status).toBe(403);
    expect((await upload(lecturer.token, '/resources/import', file)).status).toBe(403);
    expect((await as(student.token).get('/resources/import/template')).status).toBe(403);
  });
});
