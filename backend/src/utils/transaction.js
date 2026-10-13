const mongoose = require('mongoose');
const { supportsTransactions } = require('../config/database');

/**
 * Runs `fn(session)` inside a MongoDB transaction when the deployment
 * supports one (replica set / sharded cluster).
 *
 * On a standalone `mongod`, the common local-development setup, sessions
 * cannot be committed, so `fn(null)` runs directly. Callers must therefore
 * still order their writes so the most important one happens last and must
 * treat `session` as optional when passing it to queries.
 */
async function withTransaction(fn) {
  if (!supportsTransactions()) {
    return fn(null);
  }

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

/** Spreads `{ session }` into query options only when a session exists. */
const inSession = (session) => (session ? { session } : {});

module.exports = { withTransaction, inSession };
