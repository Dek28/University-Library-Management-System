/* eslint-disable no-console */
/**
 * Development seed.
 *
 *   npm run seed          ensure roles, settings and the super administrator
 *   npm run seed:fresh    wipe the database first, then seed demo data
 *
 * The super administrator password comes from SEED_ADMIN_PASSWORD; nothing is
 * hardcoded, and the account is flagged `mustChangePassword` outside development.
 */
const mongoose = require('mongoose');
const env = require('../config/env');
const { connectDatabase, disconnectDatabase } = require('../config/database');
const logger = require('../config/logger');
const models = require('../models');
const { ROLE_DEFINITIONS, ROLE_KEYS } = require('../constants/permissions');
const { generateBarcode, fineCode, groupCode, reservationCode } = require('../utils/identifiers');
const { nextLoanCode, formatAccession, setAccessionCounter } = require('../services/sequence.service');
const { addDays, endOfDay } = require('../utils/datetime');

const {
  Role, User, Faculty, Department, Program, Category, Subject, Publisher,
  Language, Shelf, StudySpace, Author, Resource, ResourceCopy, Loan, Fine,
  Reservation, SystemSetting, ReadingGroup, ReadingGroupSession, DigitalResource,
} = models;

const args = process.argv.slice(2);
const FRESH = args.includes('--fresh');
const DEMO = FRESH || args.includes('--demo');

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const pickSome = (arr, n) => [...arr].sort(() => Math.random() - 0.5).slice(0, n);

async function seedRoles() {
  const roles = {};
  for (const definition of ROLE_DEFINITIONS) {
    // Permissions are refreshed on every run so code changes reach the database.
    // eslint-disable-next-line no-await-in-loop
    const role = await Role.findOneAndUpdate(
      { key: definition.key },
      { $set: { ...definition, isSystem: true, isActive: true } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    roles[definition.key] = role;
  }
  console.log(`  roles                 ${Object.keys(roles).length}`);
  return roles;
}

async function seedSettings() {
  const existing = await SystemSetting.findOne({ key: 'global' });
  if (existing) return existing;
  const settings = await SystemSetting.create({
    ...SystemSetting.defaults(),
    institution: {
      universityName: 'Example University',
      libraryName: 'Main University Library',
      email: 'library@example.edu',
      phone: '+255 700 000 000',
      address: 'University Road, Campus',
      website: 'https://library.example.edu',
    },
    academic: { currentAcademicYear: '2026/2027', currentSemester: 1 },
    locale: { currency: 'USD', currencySymbol: '$', timezone: 'Africa/Dar_es_Salaam', dateFormat: 'YYYY-MM-DD' },
  });
  console.log('  settings              1');
  return settings;
}

async function seedSuperAdmin(roles) {
  const existing = await User.findOne({ email: env.seed.adminEmail });
  if (existing) {
    console.log(`  super administrator   exists (${existing.email})`);
    return existing;
  }
  const admin = await User.create({
    employeeId: 'ADM001',
    firstName: 'System',
    lastName: 'Administrator',
    email: env.seed.adminEmail,
    password: env.seed.adminPassword,
    role: roles[ROLE_KEYS.SUPER_ADMIN]._id,
    status: 'active',
    barcode: generateBarcode('30'),
    // Force a change on first sign-in outside development.
    mustChangePassword: env.nodeEnv !== 'development',
  });
  console.log(`  super administrator   created (${admin.email})`);
  return admin;
}

async function seedReferenceData(admin) {
  const stamp = { createdBy: admin._id, updatedBy: admin._id };

  const faculties = await Faculty.insertMany([
    { code: 'FSC', name: 'Faculty of Science', dean: 'Prof. J. Mbwana', ...stamp },
    { code: 'FED', name: 'Faculty of Education', dean: 'Prof. A. Kimaro', ...stamp },
    { code: 'FBM', name: 'Faculty of Business and Management', dean: 'Dr. S. Ndaki', ...stamp },
    { code: 'FHS', name: 'Faculty of Health Sciences', dean: 'Prof. R. Massawe', ...stamp },
  ]);
  const byFaculty = Object.fromEntries(faculties.map((f) => [f.code, f]));

  const departments = await Department.insertMany([
    { code: 'CS', name: 'Computer Science', faculty: byFaculty.FSC._id, head: 'Dr. P. Lyimo', ...stamp },
    { code: 'MATH', name: 'Mathematics', faculty: byFaculty.FSC._id, head: 'Dr. E. Shayo', ...stamp },
    { code: 'EDU', name: 'Curriculum and Teaching', faculty: byFaculty.FED._id, ...stamp },
    { code: 'ACC', name: 'Accounting and Finance', faculty: byFaculty.FBM._id, ...stamp },
    { code: 'NUR', name: 'Nursing', faculty: byFaculty.FHS._id, ...stamp },
  ]);
  const byDept = Object.fromEntries(departments.map((d) => [d.code, d]));

  const programs = await Program.insertMany([
    { code: 'BSCS', name: 'BSc Computer Science', department: byDept.CS._id, level: 'bachelor', durationYears: 3, ...stamp },
    { code: 'BSCM', name: 'BSc Mathematics', department: byDept.MATH._id, level: 'bachelor', durationYears: 3, ...stamp },
    { code: 'BED', name: 'Bachelor of Education', department: byDept.EDU._id, level: 'bachelor', durationYears: 4, ...stamp },
    { code: 'BACC', name: 'BCom Accounting', department: byDept.ACC._id, level: 'bachelor', durationYears: 3, ...stamp },
    { code: 'BSCN', name: 'BSc Nursing', department: byDept.NUR._id, level: 'bachelor', durationYears: 4, ...stamp },
    { code: 'MSCS', name: 'MSc Computer Science', department: byDept.CS._id, level: 'master', durationYears: 2, ...stamp },
  ]);

  // Categories have no stored code; these keys only link the seed data below.
  const categorySpecs = {
    COMP: { name: 'Computing and Information Technology', deweyRange: '000-006' },
    MATH: { name: 'Mathematics and Statistics', deweyRange: '510-519' },
    MED: { name: 'Medicine and Health', deweyRange: '610-619' },
    BUS: { name: 'Business and Economics', deweyRange: '330-339' },
    EDU: { name: 'Education', deweyRange: '370-379' },
    REF: { name: 'General Reference', deweyRange: '030-039' },
  };
  const categories = await Category.insertMany(Object.values(categorySpecs).map((spec) => ({ ...spec, ...stamp })));
  const byCat = Object.fromEntries(Object.keys(categorySpecs).map((key, i) => [key, categories[i]]));

  await Subject.insertMany([
    { name: 'Algorithms and Data Structures', category: byCat.COMP._id, ...stamp },
    { name: 'Database Systems', category: byCat.COMP._id, ...stamp },
    { name: 'Computer Networks', category: byCat.COMP._id, ...stamp },
    { name: 'Statistics', category: byCat.MATH._id, ...stamp },
    { name: 'Nursing Practice', category: byCat.MED._id, ...stamp },
    { name: 'Financial Accounting', category: byCat.BUS._id, ...stamp },
  ]);

  const publishers = await Publisher.insertMany([
    { name: 'Pearson Education', country: 'United Kingdom', ...stamp },
    { name: 'MIT Press', country: 'United States', ...stamp },
    { name: 'Oxford University Press', country: 'United Kingdom', ...stamp },
    { name: 'Elsevier', country: 'Netherlands', ...stamp },
    { name: 'Example University Press', country: 'Tanzania', ...stamp },
  ]);

  const languages = await Language.insertMany([
    { name: 'English', ...stamp },
    { name: 'Kiswahili', ...stamp },
    { name: 'French', ...stamp },
  ]);

  // A shelf is just a section and a rack; its name is derived from them.
  const shelves = await Shelf.insertMany([
    { section: 'Computing', rack: 'R1', ...stamp },
    { section: 'Computing', rack: 'R2', ...stamp },
    { section: 'Sciences', rack: 'R1', ...stamp },
    { section: 'Health', rack: 'R1', ...stamp },
    { section: 'Reference', rack: 'R1', ...stamp },
  ]);

  const spaces = await StudySpace.insertMany([
    { name: 'Group Study Room 1', spaceType: 'room', capacity: 10, location: 'Ground floor, east wing', ...stamp },
    { name: 'Group Study Room 2', spaceType: 'room', capacity: 8, location: 'Ground floor, east wing', ...stamp },
    { name: 'Reading Table 1', spaceType: 'table', capacity: 6, location: 'First floor reading hall', ...stamp },
    { name: 'Reading Table 2', spaceType: 'table', capacity: 6, location: 'First floor reading hall', ...stamp },
    { name: 'Main Reading Hall', spaceType: 'hall', capacity: 60, location: 'Second floor', ...stamp },
  ]);

  const authorNames = [
    ['Thomas', 'Cormen'], ['Abraham', 'Silberschatz'], ['Andrew', 'Tanenbaum'],
    ['Patricia', 'Potter'], ['Robert', 'Kiyosaki'], ['Grace', 'Mwakalinga'],
    ['Joseph', 'Mrema'], ['Hadija', 'Salum'], ['Ian', 'Sommerville'], ['Anne', 'Kessy'],
  ];
  const authors = await Author.insertMany(
    authorNames.map(([firstName, lastName]) => ({
      firstName, lastName, fullName: `${firstName} ${lastName}`,
      nationality: 'International', isActive: true, ...stamp,
    })),
  );

  console.log(`  reference data        ${faculties.length} faculties, ${departments.length} departments, `
    + `${programs.length} programs, ${categories.length} categories, ${shelves.length} shelves, ${spaces.length} spaces`);

  return { faculties: byFaculty, departments: byDept, programs, categories: byCat, publishers, languages, shelves, spaces, authors };
}

async function seedUsers(roles, ref) {
  const departmentList = Object.values(ref.departments);

  const staff = [
    { employeeId: 'LIB001', firstName: 'Mariam', lastName: 'Juma', email: 'mariam.juma@example.edu', role: roles.librarian },
    { employeeId: 'LIB002', firstName: 'Peter', lastName: 'Nkya', email: 'peter.nkya@example.edu', role: roles.librarian },
    { employeeId: 'ADM002', firstName: 'Grace', lastName: 'Mollel', email: 'grace.mollel@example.edu', role: roles.admin },
    { employeeId: 'LEC001', firstName: 'Daniel', lastName: 'Massawe', email: 'daniel.massawe@example.edu', role: roles.lecturer, department: ref.departments.CS },
    { employeeId: 'LEC002', firstName: 'Neema', lastName: 'Shirima', email: 'neema.shirima@example.edu', role: roles.lecturer, department: ref.departments.NUR },
  ];

  const staffDocs = [];
  for (const person of staff) {
    // eslint-disable-next-line no-await-in-loop
    staffDocs.push(await User.create({
      employeeId: person.employeeId,
      firstName: person.firstName,
      lastName: person.lastName,
      email: person.email,
      password: 'Password123!',
      role: person.role._id,
      department: person.department?._id || null,
      faculty: person.department?.faculty || null,
      status: 'active',
      gender: pick(['male', 'female']),
      phone: `+2557${Math.floor(10000000 + Math.random() * 89999999)}`,
      barcode: generateBarcode('30'),
      mustChangePassword: false,
    }));
  }

  const firstNames = ['Amina', 'Joseph', 'Fatuma', 'Emanuel', 'Zawadi', 'Baraka', 'Neema', 'Ibrahim',
    'Rehema', 'Frank', 'Salma', 'Gerald', 'Upendo', 'Hamisi', 'Anita', 'Method', 'Sophia', 'Elias',
    'Doreen', 'Kelvin', 'Mwajuma', 'Godfrey', 'Tumaini', 'Lucas'];
  const lastNames = ['Yusuf', 'Mwangi', 'Said', 'Kileo', 'Mushi', 'Mgeni', 'Ally', 'Chuwa',
    'Msuya', 'Kimambo', 'Ndosi', 'Kessy', 'Mrisho', 'Lyimo', 'Swai', 'Makame'];

  const students = [];
  for (let i = 0; i < 40; i += 1) {
    const department = pick(departmentList);
    const program = pick(ref.programs.filter((p) => String(p.department) === String(department._id))) || ref.programs[0];
    const firstName = firstNames[i % firstNames.length];
    const lastName = lastNames[i % lastNames.length];
    students.push({
      registrationNumber: `REG/2026/${String(i + 1).padStart(4, '0')}`,
      firstName,
      lastName,
      email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@students.example.edu`,
      password: 'Password123!',
      role: roles.student._id,
      department: department._id,
      faculty: department.faculty,
      program: program._id,
      academicYear: '2026/2027',
      yearOfStudy: (i % 3) + 1,
      semester: (i % 2) + 1,
      graduationYear: 2027 + (i % 3),
      gender: i % 2 === 0 ? 'female' : 'male',
      phone: `+2556${Math.floor(10000000 + Math.random() * 89999999)}`,
      barcode: generateBarcode('30'),
      status: 'active',
      mustChangePassword: false,
    });
  }

  // Created one at a time so the password hashing hook runs for each document.
  const studentDocs = [];
  for (const student of students) {
    // eslint-disable-next-line no-await-in-loop
    studentDocs.push(await User.create(student));
  }

  console.log(`  users                 ${staffDocs.length} staff, ${studentDocs.length} students`);
  return { staff: staffDocs, students: studentDocs };
}

async function seedCatalogue(admin, ref) {
  const titles = [
    { title: 'Introduction to Algorithms', type: 'book', cat: 'COMP', year: 2022, pub: 1, copies: 5, price: 85 },
    { title: 'Database System Concepts', type: 'book', cat: 'COMP', year: 2021, pub: 0, copies: 4, price: 70 },
    { title: 'Computer Networks', type: 'book', cat: 'COMP', year: 2020, pub: 0, copies: 4, price: 65 },
    { title: 'Software Engineering', type: 'book', cat: 'COMP', year: 2023, pub: 0, copies: 3, price: 72 },
    { title: 'Fundamentals of Nursing', type: 'book', cat: 'MED', year: 2022, pub: 3, copies: 6, price: 95 },
    { title: 'Clinical Nursing Skills', type: 'book', cat: 'MED', year: 2021, pub: 3, copies: 3, price: 88 },
    { title: 'Financial Accounting Principles', type: 'book', cat: 'BUS', year: 2023, pub: 0, copies: 4, price: 60 },
    { title: 'Principles of Microeconomics', type: 'book', cat: 'BUS', year: 2020, pub: 2, copies: 3, price: 58 },
    { title: 'Advanced Engineering Mathematics', type: 'book', cat: 'MATH', year: 2021, pub: 0, copies: 4, price: 90 },
    { title: 'Introduction to Statistics', type: 'book', cat: 'MATH', year: 2022, pub: 2, copies: 5, price: 55 },
    { title: 'Curriculum Design and Development', type: 'book', cat: 'EDU', year: 2019, pub: 4, copies: 3, price: 45 },
    { title: 'Teaching Methods in Higher Education', type: 'book', cat: 'EDU', year: 2023, pub: 4, copies: 2, price: 48 },
    { title: 'Oxford Dictionary of Science', type: 'reference', cat: 'REF', year: 2020, pub: 2, copies: 2, price: 40, reference: true },
    { title: 'Journal of African Computing', type: 'journal', cat: 'COMP', year: 2024, pub: 4, copies: 2, price: 30 },
    { title: 'East African Journal of Health Sciences', type: 'journal', cat: 'MED', year: 2024, pub: 4, copies: 2, price: 35 },
    { title: 'Machine Learning for Beginners', type: 'book', cat: 'COMP', year: 2024, pub: 1, copies: 4, price: 68 },
  ];

  const shelfFor = (categoryKey) => ({
    COMP: ref.shelves[0], MATH: ref.shelves[2], MED: ref.shelves[3], BUS: ref.shelves[1],
    EDU: ref.shelves[1], REF: ref.shelves[4],
  }[categoryKey] || ref.shelves[0]);

  const resources = [];
  const copies = [];

  for (const spec of titles) {
    const category = ref.categories[spec.cat];
    // eslint-disable-next-line no-await-in-loop
    const resource = await Resource.create({
      title: spec.title,
      resourceType: spec.type,
      isbn: `978${Math.floor(1000000000 + Math.random() * 8999999999)}`,
      authors: pickSome(ref.authors, 2).map((a) => a._id),
      publisher: ref.publishers[spec.pub]._id,
      publicationYear: spec.year,
      edition: `${1 + Math.floor(Math.random() * 5)}th`,
      language: ref.languages[0]._id,
      category: category._id,
      department: null,
      keywords: spec.title.toLowerCase().split(' ').filter((w) => w.length > 3),
      description: `${spec.title}. A core text held by the ${category.name} collection.`,
      acquisitionDate: new Date(Date.now() - Math.random() * 730 * 86400000),
      acquisitionSource: 'purchase',
      purchasePrice: spec.price,
      replacementCost: Math.round(spec.price * 1.2),
      isBorrowable: !spec.reference,
      isReferenceOnly: Boolean(spec.reference),
      status: spec.reference ? 'reference_only' : 'available',
      createdBy: admin._id,
      updatedBy: admin._id,
    });
    resources.push(resource);

    const shelf = shelfFor(spec.cat);
    for (let i = 1; i <= spec.copies; i += 1) {
      copies.push({
        resource: resource._id,
        // Library-wide running number; the counter is set to match after insert.
        accessionNumber: formatAccession(copies.length + 1),
        barcode: generateBarcode('20'),
        shelf: shelf._id,
        section: shelf.section,
        rack: shelf.rack,
        status: spec.reference ? 'reference_only' : 'available',
        condition: pick(['excellent', 'good', 'good', 'fair']),
        acquisitionDate: resource.acquisitionDate,
        price: spec.price,
        replacementCost: Math.round(spec.price * 1.2),
        createdBy: admin._id,
        updatedBy: admin._id,
      });
    }
  }

  await ResourceCopy.insertMany(copies);
  await setAccessionCounter(copies.length);
  const resourceService = require('../services/resource.service');
  for (const resource of resources) {
    // eslint-disable-next-line no-await-in-loop
    await resourceService.syncAvailability(resource._id);
  }

  console.log(`  catalogue             ${resources.length} titles, ${copies.length} copies`);
  return resources;
}

async function seedCirculation(staff, students, resources) {
  const librarian = staff.find((s) => s.employeeId === 'LIB001');
  const fineService = require('../services/fine.service');
  const userService = require('../services/user.service');
  const resourceService = require('../services/resource.service');

  const borrowers = students.slice(0, 18);
  let issued = 0;
  let returned = 0;
  let overdue = 0;
  const fineDocs = [];

  for (let i = 0; i < borrowers.length; i += 1) {
    const borrower = borrowers[i];
    const copy = await ResourceCopy.findOne({ status: 'available' }).sort({ _id: i % 2 === 0 ? 1 : -1 });
    if (!copy) break;

    // A spread of on-time, still-out and overdue loans so dashboards and
    // reports have realistic data to show.
    const isReturned = i % 3 === 0;
    const isOverdue = !isReturned && i % 4 === 1;
    const borrowDate = new Date(Date.now() - (isOverdue ? 30 : 7) * 86400000);
    const dueDate = endOfDay(addDays(borrowDate, 14));

    const loan = await Loan.create({
      transactionId: await nextLoanCode({ date: borrowDate }),
      user: borrower._id,
      resource: copy.resource,
      copy: copy._id,
      borrowDate,
      dueDate,
      status: isReturned ? 'returned' : (isOverdue ? 'overdue' : 'active'),
      returnDate: isReturned ? addDays(borrowDate, 10) : null,
      returnedTo: isReturned ? librarian._id : null,
      conditionOnReturn: isReturned ? 'good' : null,
      issuedBy: librarian._id,
      maxRenewals: 1,
      conditionOnIssue: copy.condition,
      daysOverdue: isOverdue ? 16 : 0,
    });

    if (!isReturned) {
      copy.status = 'borrowed';
      copy.currentLoan = loan._id;
      issued += 1;
      if (isOverdue) overdue += 1;
    } else {
      returned += 1;
    }
    copy.borrowCount += 1;
    copy.lastBorrowedAt = borrowDate;
    await copy.save();
    await Resource.updateOne({ _id: copy.resource }, { $inc: { borrowCount: 1 } });

    if (isOverdue) {
      const fine = await Fine.create({
        fineCode: fineCode(),
        user: borrower._id,
        loan: loan._id,
        resource: copy.resource,
        copy: copy._id,
        fineType: 'overdue',
        amount: 8,
        amountPaid: i % 8 === 1 ? 3 : 0,
        status: i % 8 === 1 ? 'partially_paid' : 'outstanding',
        reason: '16 chargeable day(s) overdue at 0.5/day',
        daysOverdue: 16,
        createdBy: librarian._id,
      });
      await Loan.updateOne({ _id: loan._id }, { $push: { fines: fine._id }, $inc: { fineAmount: fine.amount } });
      fineDocs.push(fine);
    }
  }

  for (const resource of resources) {
    await resourceService.syncAvailability(resource._id);
  }
  for (const student of students) {
    await userService.refreshUserCounters(student._id);
  }

  // A hold on a title whose copies are all out.
  const busyResource = await Resource.findOne({ availableCopies: 0, totalCopies: { $gt: 0 } });
  let reservations = 0;
  if (busyResource) {
    await Reservation.create({
      reservationCode: reservationCode(),
      user: students[25]._id,
      resource: busyResource._id,
      status: 'pending',
      queuePosition: 1,
      createdBy: students[25]._id,
    });
    reservations = 1;
  }

  console.log(`  circulation           ${issued} on loan (${overdue} overdue), ${returned} returned, `
    + `${fineDocs.length} fines, ${reservations} reservation(s)`);
}

async function seedReadingGroups(staff, students, ref) {
  const librarian = staff.find((s) => s.employeeId === 'LIB001');
  const groups = [];

  for (let i = 0; i < 3; i += 1) {
    const members = students.slice(i * 5, i * 5 + 5);
    // eslint-disable-next-line no-await-in-loop
    const group = await ReadingGroup.create({
      groupCode: groupCode(),
      name: ['Algorithms Study Circle', 'Nursing Practice Group', 'Accounting Revision Group'][i],
      readingTopic: ['Graph algorithms and complexity', 'Patient care fundamentals', 'Financial statements'][i],
      description: 'Weekly peer study session held in the library.',
      leader: members[0]._id,
      members: members.map((m) => m._id),
      department: members[0].department,
      faculty: members[0].faculty,
      academicYear: '2026/2027',
      status: 'active',
      createdBy: librarian._id,
      updatedBy: librarian._id,
    });
    groups.push(group);

    const sessionDate = addDays(new Date(), i + 1);
    const base = new Date(sessionDate);
    base.setHours(0, 0, 0, 0);
    const startMinutes = 14 * 60;
    const endMinutes = 16 * 60;

    // eslint-disable-next-line no-await-in-loop
    await ReadingGroupSession.create({
      group: group._id,
      title: `${group.name} weekly session`,
      topic: group.readingTopic,
      sessionDate: base,
      startTime: '14:00',
      endTime: '16:00',
      startsAt: new Date(base.getTime() + startMinutes * 60000),
      endsAt: new Date(base.getTime() + endMinutes * 60000),
      space: ref.spaces[i]._id,
      status: 'planned',
      expectedAttendees: members.length,
      createdBy: librarian._id,
      updatedBy: librarian._id,
    });
  }

  console.log(`  reading groups        ${groups.length} groups with one scheduled session each`);
}

async function seedDigital(staff, ref) {
  const librarian = staff.find((s) => s.employeeId === 'LIB001');
  // Metadata only: no placeholder blob is written, so the download endpoint
  // correctly reports a missing file rather than serving an empty document.
  const items = [
    { title: 'Machine learning approaches to crop yield prediction', type: 'thesis', level: 'university', year: 2025 },
    { title: 'Nurse staffing and patient outcomes in referral hospitals', type: 'dissertation', level: 'students', year: 2024 },
    { title: 'Annual library report 2025', type: 'report', level: 'public', year: 2025 },
    { title: 'Faculty research seminar proceedings', type: 'conference_proceeding', level: 'staff', year: 2025 },
  ];

  for (const item of items) {
    // eslint-disable-next-line no-await-in-loop
    await DigitalResource.create({
      title: item.title,
      authorNames: ['A. Researcher'],
      supervisor: 'Prof. J. Mbwana',
      resourceType: item.type,
      year: item.year,
      faculty: ref.faculties.FSC._id,
      department: ref.departments.CS._id,
      abstract: `${item.title}. Full text available to authorised members through the repository.`,
      keywords: item.title.toLowerCase().split(' ').filter((w) => w.length > 4).slice(0, 5),
      accessLevel: item.level,
      storageDriver: 'local',
      storageKey: `digital/seed/${item.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`,
      originalName: `${item.title.slice(0, 40)}.pdf`,
      mimeType: 'application/pdf',
      fileSize: 1024 * 512,
      uploadedBy: librarian._id,
      createdBy: librarian._id,
      isPublished: true,
    });
  }
  console.log(`  digital repository    ${items.length} records (metadata only)`);
}

async function run() {
  console.log(`\nSeeding ULMS (${env.nodeEnv})`);
  await connectDatabase();

  if (FRESH) {
    console.log('  dropping database…');
    await mongoose.connection.dropDatabase();
  }

  const roles = await seedRoles();
  await seedSettings();
  const admin = await seedSuperAdmin(roles);

  if (DEMO) {
    const existingStudents = await User.countDocuments({ role: roles.student._id });
    if (existingStudents > 0 && !FRESH) {
      console.log('  demo data             skipped (data already present; use --fresh to rebuild)');
    } else {
      const ref = await seedReferenceData(admin);
      const { staff, students } = await seedUsers(roles, ref);
      const resources = await seedCatalogue(admin, ref);
      await seedCirculation(staff, students, resources);
      await seedReadingGroups(staff, students, ref);
      await seedDigital(staff, ref);
    }
  }

  console.log('\nDevelopment credentials');
  console.log(`  super administrator   ${env.seed.adminEmail} / ${env.seed.adminPassword}`);
  if (DEMO) {
    console.log('  administrator         grace.mollel@example.edu / Password123!');
    console.log('  librarian             mariam.juma@example.edu / Password123!');
    console.log('  academic staff        daniel.massawe@example.edu / Password123!');
    console.log('  student               REG/2026/0001 / Password123!');
  }
  console.log('\nChange these before any real deployment.\n');

  await disconnectDatabase();
}

run().catch(async (err) => {
  logger.error(`Seed failed: ${err.stack || err.message}`);
  await disconnectDatabase();
  process.exit(1);
});
