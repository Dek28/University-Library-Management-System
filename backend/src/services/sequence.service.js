const Counter = require('../models/Counter');
const settingsService = require('./settings.service');
const { dayjs } = require('../utils/datetime');

/**
 * Daily sequential reference codes: PREFIX-YYYYMMDD-NNNNNN, where NNNNNN counts
 * from 000001 each day (e.g. LN-20261011-000042 is the 42nd loan that day).
 *
 * The day is taken in the library's configured timezone, so a loan issued
 * just after local midnight carries that day's date. The counter is atomic but
 * deliberately outside any transaction: a request that fails after taking a
 * number leaves a gap rather than holding a lock other desks would wait on.
 */
async function nextDailyCode(prefix, { date = new Date(), exists } = {}) {
  const timezone = await settingsService.getTimezone();
  const day = dayjs(date).tz(timezone).format('YYYYMMDD');

  // `exists` guards against codes issued under an earlier format that happen
  // to look like a counter value; it is almost never true.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    const counter = await Counter.findOneAndUpdate(
      { _id: `${prefix}-${day}` },
      { $inc: { seq: 1 } },
      { upsert: true, new: true },
    );
    const code = `${prefix}-${day}-${String(counter.seq).padStart(6, '0')}`;
    // eslint-disable-next-line no-await-in-loop
    if (!exists || !(await exists(code))) return code;
  }
  throw new Error(`Could not allocate a unique ${prefix} code`);
}

/** Next loan transaction ID, e.g. LN-20261011-000042. */
const nextLoanCode = (options = {}) => {
  // Required lazily: the Loan model is not needed by other prefixes.
  const Loan = require('../models/Loan');
  return nextDailyCode('LN', { ...options, exists: (code) => Loan.exists({ transactionId: code }) });
};

/**
 * Accession numbers: one running number for the whole library, zero-padded to
 * six digits (000001, 000002, …), in the order copies are registered.
 */
const ACCESSION_COUNTER = 'ACCESSION';
const formatAccession = (n) => String(n).padStart(6, '0');

/**
 * Reserves `count` consecutive accession numbers with one atomic `$inc`, so
 * two desks adding copies at the same moment never share a number. A number
 * already taken (typed in by hand when adding a copy) is skipped.
 */
async function nextAccessionNumbers(count = 1) {
  // Required lazily to keep this module free of a model cycle.
  const ResourceCopy = require('../models/ResourceCopy');
  const numbers = [];
  while (numbers.length < count) {
    const need = count - numbers.length;
    // eslint-disable-next-line no-await-in-loop
    const counter = await Counter.findOneAndUpdate(
      { _id: ACCESSION_COUNTER },
      { $inc: { seq: need } },
      { upsert: true, new: true },
    );
    const candidates = Array.from({ length: need }, (_, i) => formatAccession(counter.seq - need + 1 + i));
    // eslint-disable-next-line no-await-in-loop
    const taken = await ResourceCopy.find({ accessionNumber: { $in: candidates } })
      .setOptions({ withDeleted: true }).select('accessionNumber').lean();
    const takenSet = new Set(taken.map((c) => c.accessionNumber));
    numbers.push(...candidates.filter((n) => !takenSet.has(n)));
  }
  return numbers;
}

/** Points the accession counter at `value`, so the next copy gets `value + 1`. */
const setAccessionCounter = (value) => Counter.updateOne(
  { _id: ACCESSION_COUNTER },
  { $set: { seq: value } },
  { upsert: true },
);

module.exports = {
  nextDailyCode, nextLoanCode, nextAccessionNumbers, setAccessionCounter, formatAccession,
};
