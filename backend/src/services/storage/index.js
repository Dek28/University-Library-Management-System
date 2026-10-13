const env = require('../../config/env');
const localDriver = require('./local.driver');

/**
 * Storage abstraction.
 *
 * Every file operation in the app goes through this facade, so swapping local
 * disk for S3 / Cloudinary / Azure Blob means adding one driver module and
 * changing STORAGE_DRIVER. No call sites move.
 *
 * A driver implements:
 *   save(buffer|path, { key, mimeType })  -> { key, size, driver }
 *   stream(key)                           -> Readable
 *   remove(key)                           -> void
 *   exists(key)                           -> boolean
 *   publicUrl(key)                        -> string|null   (null = not public)
 */
const drivers = { local: localDriver };

function getDriver(name = env.storage.driver) {
  const driver = drivers[name];
  if (!driver) throw new Error(`Unknown storage driver "${name}". Registered: ${Object.keys(drivers).join(', ')}`);
  return driver;
}

const registerDriver = (name, driver) => { drivers[name] = driver; };

module.exports = {
  getDriver,
  registerDriver,
  save: (...args) => getDriver().save(...args),
  stream: (key, driverName) => getDriver(driverName).stream(key),
  remove: (key, driverName) => getDriver(driverName).remove(key),
  exists: (key, driverName) => getDriver(driverName).exists(key),
  publicUrl: (key, driverName) => getDriver(driverName).publicUrl(key),
  name: () => env.storage.driver,
};
