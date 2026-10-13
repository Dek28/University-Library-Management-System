const { Readable } = require('stream');
const ExcelJS = require('exceljs');
const Resource = require('../models/Resource');
const {
  Category, Publisher, Language, Shelf, Subject, Faculty, Department,
} = require('../models/reference');
const ApiError = require('../utils/ApiError');
const auditService = require('./audit.service');
const authorService = require('./author.service');
const copyService = require('./copy.service');
const { RESOURCE_TYPES } = require('../constants/enums');

const MAX_ROWS = 2000;
/** Rows of the template that carry drop-down lists. */
const TEMPLATE_ROWS = 1000;

/**
 * The fields of the catalogue form a spreadsheet column can fill.
 *
 * `label` is the label shown on the Add Book form, and is also the template's
 * header, so a librarian sees the same name in both places. `aliases` are other
 * headers commonly found in library and supplier spreadsheets; headers are
 * compared ignoring case, spaces and punctuation.
 */
const FIELDS = [
  { key: 'title', label: 'Title', required: true, aliases: ['book title', 'title of book', 'name', 'book name', 'book'] },
  { key: 'subtitle', label: 'Subtitle', aliases: ['sub title'] },
  { key: 'resourceType', label: 'Resource type', aliases: ['type', 'material type', 'item type', 'format', 'media type'] },
  { key: 'category', label: 'Category', aliases: ['genre', 'classification', 'collection'] },
  { key: 'isbn', label: 'ISBN', aliases: ['isbn13', 'isbn 13', 'isbn10', 'isbn 10', 'isbn no', 'isbn number'] },
  { key: 'publisher', label: 'Publisher', aliases: ['published by', 'publishing house', 'publisher name'] },
  {
    key: 'publicationYear',
    label: 'Publication year',
    aliases: ['year', 'year published', 'published', 'publication date', 'pub year', 'date published', 'year of publication'],
  },
  { key: 'edition', label: 'Edition', aliases: ['ed'] },
  { key: 'language', label: 'Language', aliases: ['lang'] },
  { key: 'volume', label: 'Volume', aliases: ['vol', 'volume no'] },
  { key: 'pages', label: 'Number of pages', aliases: ['pages', 'page count', 'no of pages', 'pagination'] },
  {
    key: 'shelf',
    label: 'Shelf (location)',
    aliases: ['shelf', 'location', 'shelf location', 'shelf name', 'call location'],
    hint: 'A shelf name such as "Computing · Rack R1", or "Computing R1"',
  },
  { key: 'shelfSection', label: 'Shelf section', aliases: ['section'] },
  { key: 'shelfRack', label: 'Shelf rack', aliases: ['rack', 'rack no'] },
  {
    key: 'authors', label: 'Authors', aliases: ['author', 'author s', 'authors names', 'writer', 'writers', 'by', 'author name'], hint: 'Separate several with ;',
  },
  {
    key: 'subjects', label: 'Subjects', aliases: ['subject', 'topics', 'topic', 'subject headings'], hint: 'Separate several with ;',
  },
  { key: 'faculty', label: 'Faculty', aliases: ['school', 'college'] },
  { key: 'department', label: 'Department', aliases: ['dept'] },
  {
    key: 'keywords', label: 'Keywords', aliases: ['keyword', 'tags', 'tag'], hint: 'Separate several with ;',
  },
  {
    key: 'description',
    label: 'Description / abstract',
    aliases: ['description', 'abstract', 'summary', 'synopsis', 'notes', 'note'],
  },
  { key: 'acquisitionSource', label: 'Acquisition source', aliases: ['source', 'acquisition', 'acquired by', 'acquisition method'] },
  { key: 'supplier', label: 'Supplier or donor', aliases: ['supplier', 'donor', 'vendor', 'bookseller', 'donated by'] },
  { key: 'purchasePrice', label: 'Purchase price', aliases: ['price', 'cost', 'unit price', 'unit cost', 'amount'] },
  { key: 'replacementCost', label: 'Replacement cost', aliases: ['replacement price', 'replacement value'] },
  {
    key: 'isBorrowable', label: 'Available for loan', aliases: ['borrowable', 'loanable', 'can borrow', 'lendable', 'for loan'], hint: 'Yes or No (default Yes)',
  },
  {
    key: 'isReferenceOnly', label: 'Reference only', aliases: ['reference', 'ref only'], hint: 'Yes or No (default No)',
  },
  {
    key: 'copies', label: 'Number of copies', aliases: ['copies', 'quantity', 'qty', 'no of copies', 'stock', 'number of copies'], hint: '0 to 100; copies get barcodes',
  },
];

const FIELD_KEYS = FIELDS.map((f) => f.key);

/** "Year Published", "year_published" and "YEAR-PUBLISHED" all become "yearpublished". */
const norm = (value) => String(value || '').replace(/^﻿/, '').toLowerCase().replace(/[^a-z0-9]/g, '');

const HEADER_INDEX = (() => {
  const index = new Map();
  FIELDS.forEach((field) => {
    [field.key, field.label, ...(field.aliases || [])].forEach((name) => {
      if (!index.has(norm(name))) index.set(norm(name), field.key);
    });
  });
  return index;
})();

// ----------------------------------------------------------------- values

const RESOURCE_TYPE_ALIASES = {
  textbook: 'book', books: 'book', monograph: 'book', novel: 'book',
  referencematerial: 'reference', ebooks: 'ebook', electronicbook: 'ebook',
  article: 'research_paper', paper: 'research_paper', journalarticle: 'research_paper',
  proceedings: 'conference_proceeding', conferencepaper: 'conference_proceeding',
  periodical: 'journal', serial: 'journal', notes: 'lecture_notes',
};

const ACQUISITION_SOURCES = ['purchase', 'donation', 'exchange', 'legal_deposit', 'internal', 'other'];
const ACQUISITION_ALIASES = {
  purchased: 'purchase', bought: 'purchase', buy: 'purchase',
  donated: 'donation', gift: 'donation', donor: 'donation',
  exchanged: 'exchange', legaldeposit: 'legal_deposit', deposit: 'legal_deposit',
  internalpublication: 'internal', inhouse: 'internal',
};

const byNorm = (values, aliases = {}) => {
  const map = new Map(values.map((v) => [norm(v), v]));
  Object.entries(aliases).forEach(([alias, value]) => map.set(alias, value));
  return map;
};
const RESOURCE_TYPE_MAP = byNorm(RESOURCE_TYPES, RESOURCE_TYPE_ALIASES);
const ACQUISITION_MAP = byNorm(ACQUISITION_SOURCES, ACQUISITION_ALIASES);

const WORD_ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
const ordinal = (n) => {
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]);
};

/** "3", "3rd", "3rd ed." and "Third Edition" are all stored as "3rd", as the form does. */
function parseEdition(raw) {
  const text = String(raw || '').trim();
  if (!text) return '';
  const digits = /^(\d{1,3})\s*(st|nd|rd|th)?\b/i.exec(text);
  if (digits) return ordinal(Number(digits[1]));
  const word = WORD_ORDINALS.indexOf(text.toLowerCase().split(/\s+/)[0]);
  if (word >= 0) return ordinal(word + 1);
  return text;
}

/** Accepts 2009, "2009", "2009-05-01", "May 2009" or an Excel date. */
function parseYear(raw) {
  const match = /\b(1[4-9]\d{2}|2[01]\d{2})\b/.exec(String(raw || ''));
  return match ? Number(match[1]) : NaN;
}

/** "$1,250.50" -> 1250.5. */
const parseNumber = (raw) => Number(String(raw || '').replace(/[^0-9.-]/g, ''));

const TRUE_WORDS = new Set(['yes', 'y', 'true', '1', 'x', 'available', 'loanable', 'borrowable']);
const FALSE_WORDS = new Set(['no', 'n', 'false', '0', 'notforloan', 'unavailable']);
function parseBoolean(raw, fallback) {
  const value = norm(raw);
  if (!value) return fallback;
  if (TRUE_WORDS.has(value)) return true;
  if (FALSE_WORDS.has(value)) return false;
  return undefined;
}

const splitList = (value) => String(value || '').split(/[;|\n]/).map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
const normIsbn = (value) => String(value || '').replace(/[^0-9Xx]/g, '').toUpperCase();

// -------------------------------------------------------------- workbook

function cellText(cell) {
  let { value } = cell;
  if (value && typeof value === 'object') {
    if (Array.isArray(value.richText)) value = value.richText.map((r) => r.text).join('');
    else if (value.text !== undefined) value = value.text; // hyperlink
    else if (value.result !== undefined) value = value.result; // formula
    else if (value.error) value = '';
  }
  if (value instanceof Date) value = value.toISOString().slice(0, 10);
  return value === null || value === undefined ? '' : String(value).replace(/^﻿/, '').trim();
}

async function loadSheet(buffer, filename = '') {
  if (/\.xls$/i.test(filename)) {
    throw ApiError.badRequest('Old .xls files cannot be read. Open the file in Excel and save it as .xlsx or .csv.');
  }
  const workbook = new ExcelJS.Workbook();
  try {
    if (/\.csv$/i.test(filename)) {
      // Keep every value as typed: automatic conversion turns ISBNs and editions into numbers or dates.
      return await workbook.csv.read(Readable.from(buffer), { map: (value) => value });
    }
    await workbook.xlsx.load(buffer);
  } catch {
    throw ApiError.badRequest('The file could not be read as a spreadsheet');
  }
  // The template's "Books" sheet, otherwise the first sheet that has data.
  return workbook.getWorksheet('Books')
    || workbook.worksheets.find((sheet) => sheet.actualRowCount > 1)
    || workbook.worksheets[0];
}

/** Headers by column number, plus the data rows as { rowNumber, cells: { [column]: text } }. */
function readSheet(sheet) {
  const headers = [];
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
    const text = cellText(cell);
    if (text) headers.push({ column: col, header: text });
  });
  if (!headers.length) throw ApiError.badRequest('The first row must contain the column headings');

  const rows = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const cells = {};
    headers.forEach(({ column }) => { cells[column] = cellText(row.getCell(column)); });
    if (Object.values(cells).some((v) => v !== '')) rows.push({ rowNumber, cells });
  });
  return { headers, rows };
}

/** Pairs each column with the form field its heading names, each field used once. */
function suggestMapping(headers) {
  const mapping = {};
  const used = new Set();
  headers.forEach(({ column, header }) => {
    const key = HEADER_INDEX.get(norm(header));
    if (key && !used.has(key)) {
      mapping[column] = key;
      used.add(key);
    }
  });
  return mapping;
}

function checkMapping(mapping, headers) {
  const columns = new Set(headers.map((h) => String(h.column)));
  const clean = {};
  const used = new Set();
  Object.entries(mapping || {}).forEach(([column, key]) => {
    if (!key) return;
    if (!columns.has(String(column))) throw ApiError.badRequest(`Column ${column} is not in the file`);
    if (!FIELD_KEYS.includes(key)) throw ApiError.badRequest(`Unknown catalogue field "${key}"`);
    if (used.has(key)) throw ApiError.badRequest(`Two columns are mapped to "${FIELDS.find((f) => f.key === key).label}"`);
    used.add(key);
    clean[column] = key;
  });
  if (!used.has('title')) throw ApiError.badRequest('Map one column to Title: every book needs a title');
  return clean;
}

const parseFile = async (buffer, filename) => {
  const sheet = await loadSheet(buffer, filename);
  if (!sheet) throw ApiError.badRequest('The uploaded file has no worksheet');
  return readSheet(sheet);
};

/**
 * First look at an uploaded file: its columns with a few sample values and the
 * suggested column -> field mapping, for the mapping step on the import screen.
 */
async function inspect(buffer, filename) {
  const { headers, rows } = await parseFile(buffer, filename);
  if (!rows.length) throw ApiError.badRequest('The file contains no data rows');
  return {
    totalRows: rows.length,
    maxRows: MAX_ROWS,
    columns: headers.map(({ column, header }) => ({
      column,
      header,
      samples: rows.map((r) => r.cells[column]).filter(Boolean).slice(0, 3),
    })),
    mapping: suggestMapping(headers),
    fields: FIELDS.map(({ key, label, required, hint }) => ({ key, label, required: Boolean(required), hint: hint || '' })),
  };
}

// --------------------------------------------------------------- template

const TEMPLATE_EXAMPLE = {
  title: 'Introduction to Algorithms',
  subtitle: '',
  resourceType: 'book',
  category: 'Computer Science',
  isbn: '9780262033848',
  publisher: 'MIT Press',
  publicationYear: 2009,
  edition: '3rd',
  language: 'English',
  volume: '',
  pages: 1312,
  shelf: 'Computing · Rack R1',
  authors: 'Thomas Cormen; Charles Leiserson',
  subjects: 'Algorithms',
  faculty: '',
  department: '',
  keywords: 'algorithms; data structures',
  description: 'A comprehensive introduction to modern algorithms.',
  acquisitionSource: 'purchase',
  supplier: 'Campus Book Distributors',
  purchasePrice: 80,
  replacementCost: 95,
  isBorrowable: 'Yes',
  isReferenceOnly: 'No',
  copies: 3,
};

/**
 * The import template: one column per catalogue form field, headed with the
 * form's own labels, with drop-down lists filled from the library's current
 * reference data so values match on the first try.
 */
async function buildTemplate() {
  const [categories, languages, shelves, faculties, departments] = await Promise.all([
    Category.find({ isActive: true }).select('name').sort('name').lean(),
    Language.find({ isActive: true }).select('name').sort('name').lean(),
    Shelf.find({ isActive: true }).select('name section rack').sort('name').lean(),
    Faculty.find({ isActive: true }).select('name').sort('name').lean(),
    Department.find({ isActive: true }).select('name').sort('name').lean(),
  ]);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Books', { views: [{ state: 'frozen', ySplit: 1 }] });
  // Section and rack columns are only for files that keep them apart; the template uses "Shelf (location)".
  const templateFields = FIELDS.filter((f) => !['shelfSection', 'shelfRack'].includes(f.key));
  sheet.columns = templateFields.map((f) => ({
    header: f.label,
    key: f.key,
    width: ['title', 'description'].includes(f.key) ? 40 : Math.min(30, Math.max(14, f.label.length + 6)),
    // ISBNs are text: as numbers Excel would round or reformat them.
    ...(f.key === 'isbn' && { style: { numFmt: '@' } }),
  }));
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.eachCell((cell, col) => {
    const field = templateFields[col - 1];
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: field.required ? 'FFB45309' : 'FF1E3A5F' } };
    if (field.hint) cell.note = field.hint;
  });
  // The example row uses the library's own reference values, so the template imports as downloaded.
  sheet.addRow({
    ...TEMPLATE_EXAMPLE,
    category: categories[0]?.name || '',
    language: languages[0]?.name || '',
    shelf: shelves[0] ? Shelf.labelOf(shelves[0]) : '',
    subjects: '',
  });

  // Drop-down sources live on a hidden sheet so long lists are not limited by Excel's 255-character inline lists.
  const lists = workbook.addWorksheet('Lists', { state: 'veryHidden' });
  const sources = {
    resourceType: RESOURCE_TYPES,
    category: categories.map((c) => c.name),
    language: languages.map((l) => l.name),
    shelf: shelves.map((s) => Shelf.labelOf(s)),
    faculty: faculties.map((f) => f.name),
    department: departments.map((d) => d.name),
    acquisitionSource: ACQUISITION_SOURCES,
    isBorrowable: ['Yes', 'No'],
    isReferenceOnly: ['Yes', 'No'],
  };
  Object.entries(sources).forEach(([key, values], i) => {
    if (!values.length) return;
    const listCol = i + 1;
    values.forEach((value, r) => { lists.getCell(r + 1, listCol).value = value; });
    const letter = lists.getColumn(listCol).letter;
    const col = sheet.getColumn(key).letter;
    // A free value is still accepted on import, so show a warning rather than block typing.
    for (let row = 2; row <= TEMPLATE_ROWS + 1; row += 1) {
      sheet.getCell(`${col}${row}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`Lists!$${letter}$1:$${letter}$${values.length}`],
        showErrorMessage: true,
        errorStyle: 'warning',
        error: 'This value is not in the library\'s list. It will be checked on import.',
      };
    }
  });

  const notes = workbook.addWorksheet('Instructions');
  notes.columns = [{ width: 34 }, { width: 90 }];
  notes.addRow(['Bulk catalogue import']).font = { bold: true, size: 13 };
  notes.addRow([]);
  notes.addRow(['One row per title. Each column fills the field of the same name on the Add Book form.']);
  notes.addRow(['Only Title is required. Columns you do not need can be deleted or left empty.']);
  notes.addRow(['Your own spreadsheet works too: on upload you can match each of its columns to a form field.']);
  notes.addRow([]);
  notes.addRow(['Column', 'What to enter']).font = { bold: true };
  [
    ['Resource type', `One of: ${RESOURCE_TYPES.join(', ')}. Defaults to book.`],
    ['Category, Language, Subjects', 'A name from Administration > Reference data, or tick "Create missing" when importing.'],
    ['Faculty, Department', 'A name or code from Administration > Reference data.'],
    ['Shelf (location)', 'An existing shelf, e.g. "Computing · Rack R1" (or "Computing R1").'],
    ['Authors, Subjects, Keywords', 'Separate several values with a semicolon (;). New authors and publishers are registered automatically.'],
    ['Publication year', 'A year such as 2009.'],
    ['Edition', '3, 3rd or Third: all are stored as "3rd".'],
    ['Acquisition source', ACQUISITION_SOURCES.join(', ')],
    ['Available for loan / Reference only', 'Yes or No.'],
    ['Number of copies', 'Physical copies to create now, each with its own barcode (0 = catalogue record only).'],
    ['ISBN', 'A title whose ISBN is already in the catalogue is reported and skipped.'],
  ].forEach((line) => notes.addRow(line));

  return workbook;
}

// ----------------------------------------------------------------- import

/** Case/punctuation-insensitive lookup over reference records by name (and code). */
function lookup(records, ...fields) {
  const map = new Map();
  records.forEach((record) => fields.forEach((f) => {
    if (record[f] && !map.has(norm(record[f]))) map.set(norm(record[f]), record);
  }));
  return map;
}

/**
 * Imports catalogue records (and optionally their copies) from a spreadsheet.
 *
 * `mapping` pairs column numbers with catalogue fields; without one, headings
 * are matched automatically. Rows are validated and written one at a time, so
 * one bad row never aborts the file. With `dryRun` nothing at all is written.
 * With `createMissing`, unknown categories, languages and subjects are added to
 * the reference data instead of being reported as errors.
 */
async function importResources(buffer, filename, options = {}, actor, context = {}) {
  const { dryRun = false, createMissing = false } = options;
  const { headers, rows } = await parseFile(buffer, filename);
  if (!rows.length) throw ApiError.badRequest('The file contains no data rows');
  if (rows.length > MAX_ROWS) throw ApiError.badRequest(`Import files are limited to ${MAX_ROWS} rows`);

  const mapping = checkMapping(options.mapping || suggestMapping(headers), headers);
  const toRecord = ({ rowNumber, cells }) => Object.entries(mapping).reduce(
    (record, [column, key]) => ({ ...record, [key]: cells[column] || '' }),
    { rowNumber },
  );

  const [categories, shelves, publishers, languages, subjects, faculties, departments] = await Promise.all([
    Category.find().select('name').lean(),
    Shelf.find().select('name section rack').lean(),
    Publisher.find().select('name').lean(),
    Language.find().select('name').lean(),
    Subject.find().select('name').lean(),
    Faculty.find().select('name code').lean(),
    Department.find().select('name code faculty').lean(),
  ]);
  const maps = {
    category: lookup(categories, 'name'),
    publisher: lookup(publishers, 'name'),
    language: lookup(languages, 'name'),
    subject: lookup(subjects, 'name'),
    faculty: lookup(faculties, 'name', 'code'),
    department: lookup(departments, 'name', 'code'),
  };
  // A shelf answers to its name, its "Section · Rack" label, and "Section Rack" / "Section R1".
  const shelfMap = new Map();
  shelves.forEach((s) => {
    [s.name, Shelf.labelOf(s), s.section && s.rack ? `${s.section} ${s.rack}` : null]
      .filter(Boolean).forEach((name) => { if (!shelfMap.has(norm(name))) shelfMap.set(norm(name), s); });
  });

  const records = rows.map(toRecord);
  const fileIsbns = records.map((r) => normIsbn(r.isbn)).filter(Boolean);
  const existingIsbns = new Set(
    fileIsbns.length
      ? (await Resource.find({ isbn: { $in: fileIsbns } }).setOptions({ withDeleted: true }).select('isbn').lean()).map((r) => r.isbn)
      : [],
  );

  // Reference values the import adds (or, in a dry run, would add).
  const newReferences = { categories: new Set(), languages: new Set(), subjects: new Set(), publishers: new Set() };
  const MODELS = { category: Category, language: Language, subject: Subject };
  const NEW_KEY = { category: 'categories', language: 'languages', subject: 'subjects' };

  /** Finds a reference record, or notes it for creation when allowed. Returns a record, a pending name, or null. */
  const resolveRef = (kind, name) => {
    const found = maps[kind].get(norm(name));
    if (found) return found;
    if (!createMissing) return null;
    return { pendingName: String(name).trim(), kind };
  };
  const materialise = async (kind, value) => {
    if (!value?.pendingName) return value?._id || null;
    const existing = maps[kind].get(norm(value.pendingName));
    if (existing) return existing._id;
    const created = await MODELS[kind].create({ name: value.pendingName, createdBy: actor?._id });
    maps[kind].set(norm(value.pendingName), created);
    return created._id;
  };

  const results = {
    total: rows.length, imported: 0, skipped: 0, copiesCreated: 0, errors: [], created: [],
  };
  const seenIsbns = new Set();

  for (const row of records) {
    const problems = [];
    const title = String(row.title || '').replace(/\s+/g, ' ').trim();
    if (!title) problems.push('Title is empty');

    const resourceType = row.resourceType ? RESOURCE_TYPE_MAP.get(norm(row.resourceType)) : 'book';
    if (!resourceType) problems.push(`Resource type "${row.resourceType}" is not recognised`);

    const isbn = normIsbn(row.isbn);
    if (row.isbn && ![10, 13].includes(isbn.length)) problems.push(`ISBN "${row.isbn}" should have 10 or 13 digits`);
    else if (isbn && seenIsbns.has(isbn)) problems.push('ISBN appears twice in the file');
    else if (isbn && existingIsbns.has(isbn)) problems.push(`ISBN ${isbn} is already in the catalogue`);

    const year = row.publicationYear ? parseYear(row.publicationYear) : null;
    if (row.publicationYear && (!year || year > new Date().getFullYear() + 5)) {
      problems.push(`Publication year "${row.publicationYear}" is not a valid year`);
    }

    const pages = row.pages ? parseNumber(row.pages) : null;
    if (row.pages && (!Number.isInteger(pages) || pages < 0)) problems.push(`Number of pages "${row.pages}" is not a whole number`);

    const money = (key, label) => {
      if (!row[key]) return 0;
      const value = parseNumber(row[key]);
      if (!Number.isFinite(value) || value < 0) { problems.push(`${label} "${row[key]}" is not a valid amount`); return 0; }
      return Math.round(value * 100) / 100;
    };
    const purchasePrice = money('purchasePrice', 'Purchase price');
    const replacementCost = money('replacementCost', 'Replacement cost');

    const copies = row.copies ? parseNumber(row.copies) : 0;
    if (!Number.isInteger(copies) || copies < 0 || copies > 100) problems.push(`Number of copies "${row.copies}" must be a whole number from 0 to 100`);

    const isBorrowable = parseBoolean(row.isBorrowable, true);
    if (isBorrowable === undefined) problems.push(`Available for loan "${row.isBorrowable}" should be Yes or No`);
    const isReferenceOnly = parseBoolean(row.isReferenceOnly, false);
    if (isReferenceOnly === undefined) problems.push(`Reference only "${row.isReferenceOnly}" should be Yes or No`);

    const acquisitionSource = row.acquisitionSource ? ACQUISITION_MAP.get(norm(row.acquisitionSource)) : 'purchase';
    if (!acquisitionSource) problems.push(`Acquisition source "${row.acquisitionSource}" is not one of: ${ACQUISITION_SOURCES.join(', ')}`);

    const category = row.category ? resolveRef('category', row.category) : null;
    if (row.category && !category) problems.push(`Category "${row.category}" does not exist`);

    const language = row.language ? resolveRef('language', row.language) : null;
    if (row.language && !language) problems.push(`Language "${row.language}" does not exist`);

    const subjectRefs = splitList(row.subjects).map((name) => {
      const ref = resolveRef('subject', name);
      if (!ref) problems.push(`Subject "${name}" does not exist`);
      return ref;
    }).filter(Boolean);

    const faculty = row.faculty ? maps.faculty.get(norm(row.faculty)) : null;
    if (row.faculty && !faculty) problems.push(`Faculty "${row.faculty}" does not exist`);
    const department = row.department ? maps.department.get(norm(row.department)) : null;
    if (row.department && !department) problems.push(`Department "${row.department}" does not exist`);

    let shelf = null;
    if (row.shelf) {
      shelf = shelfMap.get(norm(row.shelf)) || null;
      if (!shelf) problems.push(`Shelf "${row.shelf}" does not exist`);
    } else if (row.shelfSection || row.shelfRack) {
      shelf = shelfMap.get(norm(Shelf.nameFor(row.shelfSection, row.shelfRack)))
        || shelfMap.get(norm(`${row.shelfSection} ${row.shelfRack}`)) || null;
      if (!shelf) problems.push(`No shelf with section "${row.shelfSection}" and rack "${row.shelfRack}"`);
    }

    if (problems.length) {
      results.skipped += 1;
      results.errors.push({ row: row.rowNumber, identifier: title || isbn || `Row ${row.rowNumber}`, problems });
      continue;
    }
    if (isbn) seenIsbns.add(isbn);
    if (row.publisher && !maps.publisher.has(norm(row.publisher))) newReferences.publishers.add(row.publisher.trim());
    [category, language, ...subjectRefs].filter((ref) => ref?.pendingName)
      .forEach((ref) => newReferences[NEW_KEY[ref.kind]].add(ref.pendingName));

    if (dryRun) {
      results.imported += 1;
      results.copiesCreated += copies;
      continue;
    }

    try {
      /* eslint-disable no-await-in-loop */
      let publisher = row.publisher ? maps.publisher.get(norm(row.publisher)) : null;
      if (row.publisher && !publisher) {
        publisher = await Publisher.create({ name: row.publisher.trim(), createdBy: actor?._id });
        maps.publisher.set(norm(row.publisher), publisher);
      }

      const subjectIds = [];
      for (const ref of subjectRefs) subjectIds.push(await materialise('subject', ref));

      const resource = await Resource.create({
        title,
        subtitle: row.subtitle || '',
        resourceType,
        isbn: isbn || null,
        category: await materialise('category', category),
        language: await materialise('language', language),
        subjects: [...new Set(subjectIds.map(String))],
        publisher: publisher?._id || null,
        authors: await authorService.findOrCreateByNames(splitList(row.authors), actor, context),
        faculty: faculty?._id || department?.faculty || null,
        department: department?._id || null,
        shelf: shelf?._id || null,
        publicationYear: year || undefined,
        edition: parseEdition(row.edition),
        volume: row.volume || '',
        pages: pages ?? null,
        keywords: [...new Set(splitList(row.keywords).map((k) => k.toLowerCase()))],
        description: row.description || '',
        acquisitionSource,
        supplier: row.supplier || '',
        purchasePrice,
        replacementCost,
        isBorrowable,
        isReferenceOnly,
        createdBy: actor?._id,
        updatedBy: actor?._id,
      });

      if (copies > 0) {
        await copyService.createBatch(
          {
            resource: resource._id, quantity: copies, shelf: shelf?._id, price: purchasePrice, replacementCost,
          },
          actor,
          context,
        );
        results.copiesCreated += copies;
      }
      /* eslint-enable no-await-in-loop */
      results.imported += 1;
      results.created.push({ row: row.rowNumber, id: String(resource._id), title });
    } catch (err) {
      results.skipped += 1;
      results.errors.push({
        row: row.rowNumber,
        identifier: title,
        problems: [err.code === 11000 ? 'ISBN is already in the catalogue' : err.message],
      });
    }
  }

  results.newReferences = Object.fromEntries(
    Object.entries(newReferences).map(([key, set]) => [key, [...set]]),
  );

  if (!dryRun) {
    await auditService.record({
      ...context,
      actor,
      action: 'resource_imported',
      entityType: 'Resource',
      description: `Bulk catalogue import from ${filename || 'spreadsheet'}: ${results.imported} created, `
        + `${results.skipped} skipped of ${results.total} rows, ${results.copiesCreated} copies`,
      newValue: { imported: results.imported, skipped: results.skipped, copies: results.copiesCreated },
    });
  }

  return results;
}

module.exports = {
  FIELDS, buildTemplate, inspect, importResources,
  // Exposed for unit tests.
  parseEdition, parseYear, parseBoolean,
};
