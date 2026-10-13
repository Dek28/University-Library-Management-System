/** Application-level error carrying an HTTP status and optional field errors. */
class ApiError extends Error {
  constructor(statusCode, message, errors = [], options = {}) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.errors = errors;
    this.code = options.code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message = 'Bad request', errors = []) { return new ApiError(400, message, errors); }
  static unauthorized(message = 'Authentication required') { return new ApiError(401, message); }
  static forbidden(message = 'You do not have permission to perform this action') { return new ApiError(403, message); }
  static notFound(message = 'Resource not found') { return new ApiError(404, message); }
  static conflict(message = 'Conflict', errors = []) { return new ApiError(409, message, errors); }
  static unprocessable(message = 'Validation failed', errors = []) { return new ApiError(422, message, errors); }
  static tooMany(message = 'Too many requests') { return new ApiError(429, message); }
  static internal(message = 'Internal server error') { return new ApiError(500, message); }
}

module.exports = ApiError;
