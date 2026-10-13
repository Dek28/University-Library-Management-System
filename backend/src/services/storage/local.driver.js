const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const env = require('../../config/env');

const ROOT = env.storage.localRoot;

/** Blocks traversal outside the upload root. */
function resolveKey(key) {
  const target = path.resolve(ROOT, key);
  if (!target.startsWith(path.resolve(ROOT))) {
    throw new Error('Invalid storage key');
  }
  return target;
}

async function save(buffer, { key, folder = '' } = {}) {
  const finalKey = key || path.join(folder, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`);
  const target = resolveKey(finalKey);
  await fsp.mkdir(path.dirname(target), { recursive: true });
  await fsp.writeFile(target, buffer);
  const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
  return { key: finalKey.split(path.sep).join('/'), size: buffer.length, checksum, driver: 'local' };
}

const stream = (key) => fs.createReadStream(resolveKey(key));

async function remove(key) {
  try {
    await fsp.unlink(resolveKey(key));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

async function exists(key) {
  try {
    await fsp.access(resolveKey(key));
    return true;
  } catch {
    return false;
  }
}

/**
 * Only cover images and logos are served statically. Repository documents
 * return null so they can never be fetched without an authorisation check.
 */
const publicUrl = (key) =>
  (key && (key.startsWith('covers/') || key.startsWith('logos/'))
    ? `${env.storage.publicBaseUrl}/${key}`
    : null);

module.exports = { save, stream, remove, exists, publicUrl, root: ROOT };
