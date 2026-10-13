const cron = require('node-cron');
const env = require('../config/env');
const logger = require('../config/logger');
const overdueJob = require('./overdue.job');
const reminderJob = require('./reminder.job');
const reservationJob = require('./reservation.job');

/**
 * Scheduled maintenance.
 *
 * Every job is idempotent and independently runnable, so a missed window is
 * harmless and the API keeps working normally if the scheduler is disabled.
 */
const registry = [
  { name: 'mark-overdue', cron: env.jobs.overdueCron, run: overdueJob.run },
  { name: 'due-reminders', cron: env.jobs.reminderCron, run: reminderJob.run },
  { name: 'expire-reservations', cron: env.jobs.reservationCron, run: reservationJob.run },
];

const tasks = [];

function start() {
  registry.forEach((job) => {
    if (!cron.validate(job.cron)) {
      logger.warn(`Skipping job "${job.name}": invalid cron expression "${job.cron}"`);
      return;
    }
    const task = cron.schedule(job.cron, async () => {
      try {
        const result = await job.run();
        logger.info(`Job ${job.name} finished: ${JSON.stringify(result)}`);
      } catch (err) {
        logger.error(`Job ${job.name} failed: ${err.stack || err.message}`);
      }
    });
    tasks.push(task);
    logger.info(`Scheduled job "${job.name}" (${job.cron})`);
  });
}

function stop() {
  tasks.forEach((task) => task.stop());
  tasks.length = 0;
}

/** Runs one job immediately; used by tests and the maintenance endpoint. */
async function runNow(name) {
  const job = registry.find((j) => j.name === name);
  if (!job) throw new Error(`Unknown job "${name}"`);
  return job.run();
}

module.exports = { start, stop, runNow, registry };
