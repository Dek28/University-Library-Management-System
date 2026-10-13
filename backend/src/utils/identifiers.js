const crypto = require('crypto');

const CHARS = '0123456789';

const randomDigits = (length) =>
  Array.from({ length }, () => CHARS[crypto.randomInt(0, CHARS.length)]).join('');

/**
 * Human-readable, collision-resistant reference codes.
 * Format: PREFIX-YYYYMMDD-RANDOM (e.g. LN-20260903-481920).
 */
function referenceCode(prefix) {
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}`;
  return `${prefix}-${stamp}-${randomDigits(6)}`;
}

// Loan IDs are daily sequential numbers: see services/sequence.service.js.
const fineCode = () => referenceCode('FN');
const paymentCode = () => referenceCode('PY');
const reservationCode = () => referenceCode('RS');
const clearanceCode = () => referenceCode('CL');
const groupCode = () => referenceCode('RG');
const auditCode = () => referenceCode('IA');
const orderCode = () => referenceCode('PO');
const invoiceCode = () => referenceCode('INV');

/** EAN-13 style numeric barcode, unique enough for copy labels. */
const generateBarcode = (prefix = '20') => `${prefix}${randomDigits(11)}`;

const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('hex');

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

module.exports = {
  referenceCode, fineCode, paymentCode, reservationCode,
  clearanceCode, groupCode, auditCode, orderCode, invoiceCode, generateBarcode, randomToken, hashToken, randomDigits,
};
