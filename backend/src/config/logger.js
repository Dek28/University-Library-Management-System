const winston = require('winston');
const env = require('./env');

const logger = winston.createLogger({
  level: env.logLevel,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    env.isProd
      ? winston.format.json()
      : winston.format.printf(({ level, message, timestamp, stack }) =>
          `${timestamp} [${level.toUpperCase()}] ${stack || message}`),
  ),
  transports: [new winston.transports.Console({ silent: env.isTest && env.logLevel === 'silent' })],
});

module.exports = logger;
