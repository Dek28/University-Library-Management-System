const mongoose = require('mongoose');
const env = require('./env');
const logger = require('./logger');

mongoose.set('strictQuery', true);

let transactionsSupported = null;

/**
 * Detects whether the connected deployment supports multi-document
 * transactions (replica set / sharded cluster). Standalone `mongod`
 * instances do not, and the circulation services fall back to a
 * sequential path with compensating updates in that case.
 */
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

const supportsTransactions = () => transactionsSupported === true;

async function connectDatabase(uri = env.isTest ? env.mongoUriTest : env.mongoUri) {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10000,
    maxPoolSize: 20,
  });
  logger.info(`MongoDB connected: ${mongoose.connection.name}`);
  await detectTransactionSupport();
  return mongoose.connection;
}

async function disconnectDatabase() {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
}

module.exports = { connectDatabase, disconnectDatabase, supportsTransactions, detectTransactionSupport };
