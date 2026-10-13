const ExcelJS = require('exceljs');
const User = require('../models/User');
const { Department, Faculty, Program } = require('../models/reference');
const ApiError = require('../utils/ApiError');
const auditService = require('./audit.service');
const { generateBarcode } = require('../utils/identifiers');
const { resolveRole, assertCanAssignRole } = require('./user.service');

/** Columns of the bulk-import template, in order. */
const TEMPLATE_COLUMNS = [
  { header: 'registrationNumber', key: 'registrationNumber', width: 20, required: true },
  { header: 'firstName', key: 'firstName', width: 18, required: true },
  { header: 'middleName', key: 'middleName', width: 18 },
  { header: 'lastName', key: 'lastName', width: 18, required: true },
  { header: 'email', key: 'email', width: 30, required: true },
  { header: 'phone', key: 'phone', width: 18 },
  { header: 'gender', key: 'gender', width: 12 },
  { header: 'facultyCode', key: 'facultyCode', width: 14 },
  { header: 'departmentCode', key: 'departmentCode', width: 16 },
  { header: 'programCode', key: 'programCode', width: 14 },
  { header: 'academicYear', key: 'academicYear', width: 14 },
  { header: 'yearOfStudy', key: 'yearOfStudy', width: 12 },
  { header: 'semester', key: 'semester', width: 10 },
];

async function buildTemplate() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Students');
  sheet.columns = TEMPLATE_COLUMNS.map(({ header, key, width }) => ({ header, key, width }));
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
  });
  sheet.addRow({
    registrationNumber: 'REG/2026/0001',
    firstName: 'Amina',
    middleName: 'K',
    lastName: 'Yusuf',
    email: 'amina.yusuf@example.edu',
    phone: '+255700000001',
    gender: 'female',
    facultyCode: 'FSC',
    departmentCode: 'CS',
    programCode: 'BSCS',
    academicYear: '2026/2027',
    yearOfStudy: 2,
    semester: 1,
  });

  const notes = workbook.addWorksheet('Instructions');
  notes.columns = [{ width: 100 }];
  [
    'Bulk student import template',
    '',
    'Required columns: registrationNumber, firstName, lastName, email.',
    'facultyCode / departmentCode / programCode must match existing reference codes (see Administration > Reference data).',
    'gender accepts: male, female, other, undisclosed.',
    'Every imported account is created with the default password supplied on the import screen and',
    'is required to change it at first sign-in.',
    'Rows with an existing email or registration number are reported as errors and skipped;',
    'the rest of the file is still imported.',
  ].forEach((line) => notes.addRow([line]));

  return workbook;
}

/** Normalises a worksheet into plain objects keyed by the template headers. */
function readRows(sheet) {
  const headers = [];
  sheet.getRow(1).eachCell((cell, col) => { headers[col] = String(cell.value || '').trim(); });

  const rows = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const record = {};
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      const key = headers[col];
      if (!key) return;
      let value = cell.value;
      if (value && typeof value === 'object' && value.text) value = value.text; // hyperlink cells
      if (value && typeof value === 'object' && value.result !== undefined) value = value.result; // formula cells
      record[key] = value === null || value === undefined ? '' : String(value).trim();
    });
    if (Object.values(record).some((v) => v !== '')) rows.push({ rowNumber, ...record });
  });
  return rows;
}

/**
 * Imports students from an uploaded workbook.
 *
 * Rows are validated and inserted one at a time so a single bad row never
 * aborts the whole file; the caller receives a per-row error report.
 */
async function importStudents(buffer, { roleKey = 'student', defaultPassword, dryRun = false }, actor, context = {}) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet('Students') || workbook.worksheets[0];
  if (!sheet) throw ApiError.badRequest('The uploaded workbook has no worksheets');

  const rows = readRows(sheet);
  if (!rows.length) throw ApiError.badRequest('The worksheet contains no data rows');
  if (rows.length > 5000) throw ApiError.badRequest('Import files are limited to 5000 rows');

  const role = await resolveRole(roleKey);
  await assertCanAssignRole(actor, role);

  // Preload reference codes so lookups do not hit the database per row.
  const [faculties, departments, programs] = await Promise.all([
    Faculty.find().select('code').lean(),
    Department.find().select('code faculty').lean(),
    Program.find().select('code department').lean(),
  ]);
  const byCode = (list) => new Map(list.map((item) => [item.code.toUpperCase(), item]));
  const facultyMap = byCode(faculties);
  const departmentMap = byCode(departments);
  const programMap = byCode(programs);

  const results = { total: rows.length, imported: 0, skipped: 0, errors: [] };
  const seenEmails = new Set();

  for (const row of rows) {
    const problems = [];
    const email = String(row.email || '').toLowerCase().trim();
    const registrationNumber = String(row.registrationNumber || '').toUpperCase().trim();

    if (!row.firstName) problems.push('firstName is required');
    if (!row.lastName) problems.push('lastName is required');
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) problems.push('a valid email is required');
    if (!registrationNumber) problems.push('registrationNumber is required');
    if (seenEmails.has(email)) problems.push('duplicate email within the file');

    const facultyCode = String(row.facultyCode || '').toUpperCase();
    const departmentCode = String(row.departmentCode || '').toUpperCase();
    const programCode = String(row.programCode || '').toUpperCase();
    if (facultyCode && !facultyMap.has(facultyCode)) problems.push(`unknown facultyCode "${facultyCode}"`);
    if (departmentCode && !departmentMap.has(departmentCode)) problems.push(`unknown departmentCode "${departmentCode}"`);
    if (programCode && !programMap.has(programCode)) problems.push(`unknown programCode "${programCode}"`);

    if (problems.length) {
      results.skipped += 1;
      results.errors.push({ row: row.rowNumber, identifier: email || registrationNumber, problems });
      continue;
    }

    seenEmails.add(email);

    // eslint-disable-next-line no-await-in-loop
    const clash = await User.findOne({ $or: [{ email }, { registrationNumber }] })
      .setOptions({ withDeleted: true }).select('email registrationNumber').lean();
    if (clash) {
      results.skipped += 1;
      results.errors.push({
        row: row.rowNumber,
        identifier: email,
        problems: [clash.email === email ? 'email already registered' : 'registration number already registered'],
      });
      continue;
    }

    if (dryRun) {
      results.imported += 1;
      continue;
    }

    const department = departmentCode ? departmentMap.get(departmentCode) : null;
    try {
      // eslint-disable-next-line no-await-in-loop
      await User.create({
        registrationNumber,
        firstName: row.firstName,
        middleName: row.middleName || '',
        lastName: row.lastName,
        email,
        phone: row.phone || '',
        gender: ['male', 'female', 'other', 'undisclosed'].includes(String(row.gender).toLowerCase())
          ? String(row.gender).toLowerCase() : 'undisclosed',
        password: defaultPassword,
        mustChangePassword: true,
        role: role._id,
        faculty: facultyCode ? facultyMap.get(facultyCode)._id : department?.faculty || null,
        department: department ? department._id : null,
        program: programCode ? programMap.get(programCode)._id : null,
        academicYear: row.academicYear || '',
        yearOfStudy: Number(row.yearOfStudy) || null,
        semester: Number(row.semester) || null,
        barcode: generateBarcode('30'),
        status: 'active',
      });
      results.imported += 1;
    } catch (err) {
      results.skipped += 1;
      results.errors.push({ row: row.rowNumber, identifier: email, problems: [err.message] });
    }
  }

  if (!dryRun) {
    await auditService.record({
      ...context,
      actor,
      action: 'user_imported',
      entityType: 'User',
      description: `Bulk import: ${results.imported} created, ${results.skipped} skipped of ${results.total} rows`,
      newValue: { imported: results.imported, skipped: results.skipped, role: role.key },
    });
  }

  return results;
}

module.exports = { buildTemplate, importStudents, TEMPLATE_COLUMNS };
