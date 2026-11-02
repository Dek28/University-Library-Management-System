const mongoose = require('mongoose');
const env = require('./env');
const logger = require('./logger');

mongoose.set('strictQuery', true);

let transactionsSupported = null;


async function detectTransactionSupport() {
  try {
    const admin = mongoose.connection.db.admin();
    const info = await admin.command({ hello: 1 });
    transactionsSupported = Boolean(info.setName || info.msg === 'isdbgrid');
  } catch (err) {
    transactionsSupported = false;
  }
  logger.info(`MongoDB transactions ${transactionsSupported ? 'enabled' : 'unavailable (standalone)'}`);
  return transactionsSupported;
}

/**
 * Drops indexes that were replaced by a different definition, so the old rule
 * stops rejecting valid writes. Safe to repeat: a missing index is ignored.
 */
async function dropSupersededIndexes() {
  try {
    await mongoose.connection.collection('notifications').dropIndex('dedupeKey_1');
    logger.info('Dropped superseded index notifications.dedupeKey_1');
  } catch (err) {
    // 27 = IndexNotFound, 26 = collection does not exist yet.
    if (![26, 27].includes(err.code)) logger.warn(`Could not drop notifications.dedupeKey_1: ${err.message}`);
  }
}

/**
 * `under_repair` is no longer a separate state: those copies are counted as
 * damaged, and become available again once repaired. Safe to repeat.
 */
async function migrateUnderRepairCopies() {
  try {
    const result = await mongoose.connection.collection('resourcecopies')
      .updateMany({ status: 'under_repair' }, { $set: { status: 'damaged' } });
    if (result.modifiedCount) logger.info(`Moved ${result.modifiedCount} under-repair copies to damaged`);
  } catch (err) {
    logger.warn(`Could not migrate under-repair copies: ${err.message}`);
  }
}

const supportsTransactions = () => transactionsSupported === true;

async function connectDatabase(uri = env.isTest ? env.mongoUriTest : env.mongoUri) {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10000,
    maxPoolSize: 20,
  });
  logger.info(`MongoDB connected: ${mongoose.connection.name}`);
  await dropSupersededIndexes();
  await migrateUnderRepairCopies();
  await detectTransactionSupport();
  return mongoose.connection;
}

async function disconnectDatabase() {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
}

module.exports = {
  connectDatabase, disconnectDatabase, supportsTransactions, detectTransactionSupport, migrateUnderRepairCopies,
};
