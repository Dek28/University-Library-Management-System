const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const mongoSanitize = require('express-mongo-sanitize');
const swaggerUi = require('swagger-ui-express');

const env = require('./config/env');
const logger = require('./config/logger');
const ApiError = require('./utils/ApiError');
const routes = require('./routes/v1');
const openapi = require('./docs/openapi');
const { notFound, errorHandler } = require('./middleware/error');
const {
  xssClean, captureClientIp, apiLimiter, exportLimiter,
} = require('./middleware/security');

const app = express();

app.set('trust proxy', env.trustProxyHops);
app.disable('x-powered-by');

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(compression());

app.use(cors({
  origin(origin, callback) {
    // Allow same-origin/tooling requests that send no Origin header.
    if (!origin || env.cors.origins.includes(origin)) return callback(null, true);
    return callback(ApiError.forbidden('This origin is not allowed'));
  },
  credentials: true,
  // A browser hides every non-safelisted response header from cross-origin
  // JavaScript unless it is named here. Downloads need the filename, and an
  // export that hit its row ceiling needs to be able to say so.
  exposedHeaders: ['Content-Disposition', 'X-Export-Truncated'],
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

app.use(mongoSanitize({ replaceWith: '_' }));
app.use(xssClean);
app.use(captureClientIp);

if (!env.isTest) {
  // Query strings can carry secrets, so only the path is logged.
  morgan.token('path', (req) => req.originalUrl.split('?')[0]);
  const format = env.isProd
    ? ':remote-addr - :remote-user [:date[clf]] ":method :path HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"'
    : ':method :path :status :response-time ms - :res[content-length]';
  app.use(morgan(format, {
    stream: { write: (msg) => logger.http?.(msg.trim()) || logger.info(msg.trim()) },
  }));
}

app.get('/health', (req, res) => res.json({
  success: true,
  message: 'ULMS API is healthy',
  data: { status: 'ok', environment: env.nodeEnv, timestamp: new Date().toISOString() },
}));

// Only cover images and institution logos are publicly readable; repository
// documents are streamed through an authorised controller instead.
app.use(
  `${env.storage.publicBaseUrl}/covers`,
  express.static(path.join(env.storage.localRoot, 'covers'), { maxAge: '7d' }),
);
app.use(
  `${env.storage.publicBaseUrl}/logos`,
  express.static(path.join(env.storage.localRoot, 'logos'), { maxAge: '7d' }),
);

if (env.apiDocsEnabled) {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openapi, {
    customSiteTitle: 'ULMS API Documentation',
    swaggerOptions: { persistAuthorization: true },
  }));
  app.get('/api-docs.json', (req, res) => res.json(openapi));
}

app.use(env.apiPrefix, apiLimiter, exportLimiter, routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
