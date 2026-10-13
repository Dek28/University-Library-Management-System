/* eslint-disable no-console */
/**
 * Renumbers every copy with a simple library-wide accession number
 * (000001, 000002, …) in the order the copies were registered.
 *
 *   npm run accession:renumber -- --dry-run   show what would change, write nothing
 *   npm run accession:renumber                renumber
 *
 * Before writing, the old -> new mapping is saved to backups/ as a CSV, so a
 * number written in a book or on an old report can still be traced. Stock
 * verification records are updated too; loans, fines and reservations point
 * at the copy itself, so they follow automatically. Audit log entries are
 * immutable and keep the number the copy had at the time.
 */
const fs = require('fs');
const path = require('path');
const { connectDatabase, disconnectDatabase } = require('../config/database');
// Registers every model, so the copies can be populated with their titles.
const { ResourceCopy, InventoryAudit } = require('../models');
const { formatAccession, setAccessionCounter } = require('../services/sequence.service');

const DRY_RUN = process.argv.includes('--dry-run');

async function run() {
  await connectDatabase();

  // Withdrawn/deleted copies keep a number too: their loan history refers to them.
  const copies = await ResourceCopy.find()
    .setOptions({ withDeleted: true })
    .sort({ createdAt: 1, _id: 1 })
    .select('accessionNumber resource createdAt')
    .populate({ path: 'resource', select: 'title', options: { withDeleted: true } })
    .lean();

  const mapping = copies.map((copy, index) => ({
    id: copy._id,
    from: copy.accessionNumber,
    to: formatAccession(index + 1),
    title: copy.resource?.title || '',
  }));
  const changes = mapping.filter((m) => m.from !== m.to);

  console.log(`${copies.length} copies; ${changes.length} would get a new number.`);
  mapping.slice(0, 10).forEach((m) => console.log(`  ${m.from.padEnd(18)} -> ${m.to}   ${m.title}`));
  if (mapping.length > 10) console.log(`  … and ${mapping.length - 10} more`);

  if (DRY_RUN || !changes.length) {
    if (!DRY_RUN) await setAccessionCounter(copies.length);
    console.log(DRY_RUN ? '\nDry run: nothing was changed.' : '\nNothing to change.');
    return;
  }

  // 1. Keep a record of the old numbers before anything changes.
  const dir = path.resolve(__dirname, '../../backups');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  const file = path.join(dir, `accession-renumbering-${stamp}.csv`);
  const csv = (v) => `"${String(v).replace(/"/g, '""')}"`;
  fs.writeFileSync(file, ['Old accession number,New accession number,Title,Copy id']
    .concat(mapping.map((m) => [csv(m.from), csv(m.to), csv(m.title), m.id].join(',')))
    .join('\n'));
  console.log(`\nMapping saved to ${file}`);

  // 2. Two passes, because the numbers are unique: a copy cannot take a number
  //    another copy still holds, so everyone moves to a temporary value first.
  await ResourceCopy.collection.bulkWrite(changes.map((m) => ({
    updateOne: { filter: { _id: m.id }, update: { $set: { accessionNumber: `TMP-${m.id}` } } },
  })));
  await ResourceCopy.collection.bulkWrite(changes.map((m) => ({
    updateOne: { filter: { _id: m.id }, update: { $set: { accessionNumber: m.to } } },
  })));

  // 3. Stock verification records store the number they scanned.
  const byCopy = new Map(mapping.map((m) => [String(m.id), m.to]));
  const byOld = new Map(mapping.map((m) => [m.from, m.to]));
  const audits = await InventoryAudit.find({ 'items.0': { $exists: true } }).lean();
  let auditItems = 0;
  for (const audit of audits) {
    const items = audit.items.map((item) => {
      const next = byCopy.get(String(item.copy)) || byOld.get(item.accessionNumber);
      if (next && next !== item.accessionNumber) auditItems += 1;
      return next ? { ...item, accessionNumber: next } : item;
    });
    // eslint-disable-next-line no-await-in-loop
    await InventoryAudit.collection.updateOne({ _id: audit._id }, { $set: { items } });
  }

  // 4. New copies continue from the last number.
  await setAccessionCounter(copies.length);

  console.log(`Renumbered ${changes.length} copies (${formatAccession(1)} to ${formatAccession(copies.length)}).`);
  console.log(`Updated ${auditItems} stock verification entries.`);
  console.log(`The next new copy will be ${formatAccession(copies.length + 1)}.`);
}

run()
  .catch((err) => {
    console.error(`Renumbering failed: ${err.stack || err.message}`);
    process.exitCode = 1;
  })
  .finally(disconnectDatabase);
