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
const routes = require('./routes/v1');
const openapi = require('./docs/openapi');
const { notFound, errorHandler } = require('./middleware/error');
const { xssClean, captureClientIp, apiLimiter } = require('./middleware/security');

const app = express();

// Correct client IPs when running behind a reverse proxy.
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(compression());

app.use(cors({
  origin(origin, callback) {
    // Allow same-origin/tooling requests that send no Origin header.
    if (!origin || env.cors.origins.includes(origin)) return callback(null, true);
    return callback(new Error(`Origin ${origin} is not allowed by CORS`));
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
  app.use(morgan(env.isProd ? 'combined' : 'dev', {
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

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openapi, {
  customSiteTitle: 'ULMS API Documentation',
  swaggerOptions: { persistAuthorization: true },
}));
app.get('/api-docs.json', (req, res) => res.json(openapi));

app.use(env.apiPrefix, apiLimiter, routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
