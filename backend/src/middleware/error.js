const mongoose = require('mongoose');
const { ZodError } = require('zod');
const multer = require('multer');
const ApiError = require('../utils/ApiError');
const env = require('../config/env');
const logger = require('../config/logger');

const notFound = (req, res, next) =>
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} not found`));

/** Translates framework/driver errors into a consistent ApiError. */
function normalise(err) {
  if (err instanceof ApiError) return err;

  if (err instanceof ZodError) {
    return ApiError.unprocessable(
      'Validation failed',
      err.issues.map((e) => ({ field: e.path.join('.'), message: e.message })),
    );
  }

  if (err instanceof mongoose.Error.ValidationError) {
    return ApiError.unprocessable(
      'Validation failed',
      Object.values(err.errors).map((e) => ({ field: e.path, message: e.message })),
    );
  }

  if (err instanceof mongoose.Error.CastError) {
    return ApiError.badRequest(`Invalid value for ${err.path}`);
  }

  // Another request changed the same record first.
  if (err instanceof mongoose.Error.VersionError) {
    return ApiError.conflict('This record was changed by someone else. Reload it and try again.');
  }

  if (err.code === 11000) {
    const fields = Object.keys(err.keyValue || {});
    const label = fields.length ? fields.join(', ') : 'value';
    return ApiError.conflict(
      `A record with this ${label} already exists`,
      fields.map((f) => ({ field: f, message: `${f} must be unique` })),
    );
  }

  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large' : `Upload error: ${err.message}`;
    return ApiError.badRequest(message);
  }

  if (err.type === 'entity.parse.failed') return ApiError.badRequest('Malformed JSON body');

  return null;
}

function errorHandler(err, req, res, next) {
  const apiError = normalise(err) || ApiError.internal(err.message);
  const isServerError = apiError.statusCode >= 500;

  // The query string is left out of logs because it can carry search terms or tokens.
  const where = `${req.method} ${req.originalUrl.split('?')[0]} (ip ${req.clientIp || req.ip || 'unknown'})`;
  if (isServerError) {
    logger.error(`${where} -> ${err.stack || err.message}`);
  } else {
    logger.warn(`${where} -> ${apiError.statusCode} ${apiError.message}`);
  }

  const body = {
    success: false,
    message: isServerError && !env.exposeDevSecrets ? 'Internal server error' : apiError.message,
    errors: apiError.errors || [],
  };

  // Stack traces are development-only.
  if (env.exposeDevSecrets && isServerError) body.stack = err.stack;

  res.status(apiError.statusCode).json(body);
}

module.exports = { notFound, errorHandler };
