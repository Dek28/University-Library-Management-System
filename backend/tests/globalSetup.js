/* eslint-disable no-console */
const mongoose = require('mongoose');

/**
 * Tests run against a real MongoDB instance so index behaviour, aggregation
 * pipelines and the transaction fallback are all exercised for real rather
 * than against a stub.
 *
 * The test database is dropped before the run, never the development one.
 */
module.exports = async () => {
  process.env.NODE_ENV = 'test';
  process.env.ENABLE_JOBS = 'false';
  process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'error';

  const uri = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/ulms_test';

  if (!/test/i.test(uri)) {
    throw new Error(`Refusing to run tests against "${uri}" — the database name must contain "test".`);
  }

  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  } catch (error) {
    throw new Error(
      `Cannot reach MongoDB at ${uri}.\n`
      + 'Start MongoDB (e.g. `net start MongoDB` on Windows, `sudo systemctl start mongod` on Linux) '
      + 'or point MONGO_URI_TEST at a reachable instance, then run the tests again.',
    );
  }

  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
};
