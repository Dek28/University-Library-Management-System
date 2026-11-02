const nodemailer = require('nodemailer');
const env = require('../config/env');
const logger = require('../config/logger');

let transporter;

const getTransporter = () => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.mail.host,
      port: env.mail.port,
      secure: env.mail.secure,
      auth: env.mail.user ? { user: env.mail.user, pass: env.mail.pass } : undefined,
    });
  }
  return transporter;
};

/** Messages "sent" during tests, so they can be inspected without a mail server. */
const outbox = [];

/**
 * Sends a plain-text email. Resolves to true when it was handed to the mail
 * server; with no SMTP host configured nothing leaves the process.
 */
async function sendMail({ to, subject, text }) {
  if (env.mail.host) {
    await getTransporter().sendMail({ from: env.mail.from, to, subject, text });
    return true;
  }
  if (env.isTest) {
    outbox.push({ to, subject, text });
    return true;
  }
  logger.warn(`Email is not configured (SMTP_HOST is empty); a message to ${to} was not sent`);
  return false;
}

module.exports = { sendMail, outbox };
