const path = require('path');
const multer = require('multer');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');

/**
 * Uploads are buffered in memory and only written to storage after the service
 * layer has validated MIME type, extension and size. Nothing untrusted ever
 * lands on disk under a caller-supplied name.
 */
const IMAGE_TYPES = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
};

const DOCUMENT_TYPES = {
  'application/pdf': ['.pdf'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.ms-powerpoint': ['.ppt'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
  'application/epub+zip': ['.epub'],
};

// Browsers on Windows report .csv files as "application/vnd.ms-excel" when Excel is installed.
const SPREADSHEET_TYPES = {
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.ms-excel': ['.xls', '.csv'],
  'text/csv': ['.csv'],
  'application/csv': ['.csv'],
  'text/x-csv': ['.csv'],
};

/** Rejects on MIME *and* extension so a renamed executable cannot slip past. */
function filterFor(allowed) {
  return (req, file, cb) => {
    const extensions = allowed[file.mimetype];
    if (!extensions) {
      return cb(ApiError.badRequest(`Unsupported file type: ${file.mimetype}`));
    }
    const ext = path.extname(file.originalname).toLowerCase();
    if (!extensions.includes(ext)) {
      return cb(ApiError.badRequest(`File extension ${ext} does not match its content type`));
    }
    return cb(null, true);
  };
}

const ZIP = [0x50, 0x4b, 0x03, 0x04];
const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

/** First bytes each declared type must start with. Plain-text types are checked separately. */
const SIGNATURES = {
  'application/pdf': [[0x25, 0x50, 0x44, 0x46, 0x2d]],
  'application/msword': [OLE],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [ZIP],
  'application/vnd.ms-powerpoint': [OLE],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': [ZIP],
  'application/epub+zip': [ZIP],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [ZIP],
  'image/jpeg': [[0xff, 0xd8, 0xff]],
  'image/png': [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
};

const TEXT_TYPES = new Set(['text/csv', 'application/csv', 'text/x-csv']);

const startsWith = (buffer, signature) => signature.every((byte, i) => buffer[i] === byte);

function matchesContent(file) {
  const { buffer, mimetype } = file;
  if (!buffer || !buffer.length) return false;

  if (mimetype === 'image/webp') {
    return buffer.length > 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  }
  // The spreadsheet type that Excel reports for .csv files is either a binary workbook or text.
  if (mimetype === 'application/vnd.ms-excel') {
    return startsWith(buffer, OLE) || !buffer.includes(0);
  }
  // Text uploads must not contain binary data.
  if (TEXT_TYPES.has(mimetype)) return !buffer.includes(0);

  return (SIGNATURES[mimetype] || []).some((signature) => startsWith(buffer, signature));
}

/** Rejects a file whose bytes do not match the type it claims, such as a script renamed to .pdf. */
const verifyContent = (req, res, next) => {
  if (req.file && !matchesContent(req.file)) {
    return next(ApiError.badRequest('The file content does not match its declared type'));
  }
  return next();
};

const build = (allowed, maxMb) => {
  const uploader = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxMb * 1024 * 1024, files: 1 },
    fileFilter: filterFor(allowed),
  });
  // Routes mount `.single(field)`, so the content check runs right after multer.
  return { single: (field) => [uploader.single(field), verifyContent] };
};

module.exports = {
  imageUpload: build(IMAGE_TYPES, env.storage.maxImageSizeMb),
  documentUpload: build(DOCUMENT_TYPES, env.storage.maxFileSizeMb),
  spreadsheetUpload: build(SPREADSHEET_TYPES, 10),
  IMAGE_TYPES,
  DOCUMENT_TYPES,
  SPREADSHEET_TYPES,
};
