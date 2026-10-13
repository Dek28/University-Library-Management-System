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

const build = (allowed, maxMb) =>
  multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxMb * 1024 * 1024, files: 1 },
    fileFilter: filterFor(allowed),
  });

module.exports = {
  imageUpload: build(IMAGE_TYPES, env.storage.maxImageSizeMb),
  documentUpload: build(DOCUMENT_TYPES, env.storage.maxFileSizeMb),
  spreadsheetUpload: build(SPREADSHEET_TYPES, 10),
  IMAGE_TYPES,
  DOCUMENT_TYPES,
  SPREADSHEET_TYPES,
};
