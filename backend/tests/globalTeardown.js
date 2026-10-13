const mongoose = require('mongoose');

/** Leaves the test database clean unless KEEP_TEST_DB is set for debugging. */
module.exports = async () => {
  if (process.env.KEEP_TEST_DB === 'true') return;

  const uri = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/ulms_test';
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    await mongoose.connection.dropDatabase();
  } catch {
    // Nothing to clean up if the server has already gone away.
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
};
