const { ZodError } = require('zod');
const ApiError = require('../utils/ApiError');

/**
 * Validates and *replaces* request segments with the parsed result, so
 * controllers only ever see coerced, whitelisted data.
 *
 *   router.post('/', validate({ body: createSchema }), controller.create)
 */
const validate = (schemas) => (req, res, next) => {
  try {
    for (const segment of ['params', 'query', 'body']) {
      const schema = schemas[segment];
      if (!schema) continue;
      const parsed = schema.parse(req[segment]);
      if (segment === 'query') {
        // req.query is a getter-only property on Express 5-style requests.
        Object.defineProperty(req, 'query', { value: parsed, writable: true, configurable: true });
      } else {
        req[segment] = parsed;
      }
    }
    return next();
  } catch (err) {
    if (err instanceof ZodError) {
      return next(ApiError.unprocessable(
        'Validation failed',
        err.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
      ));
    }
    return next(err);
  }
};

module.exports = validate;
