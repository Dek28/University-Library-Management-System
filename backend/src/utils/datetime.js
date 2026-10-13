const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const isSameOrBefore = require('dayjs/plugin/isSameOrBefore');

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isSameOrBefore);

/**
 * All persisted dates are UTC `Date` objects. Formatting for humans happens
 * at the edges (reports, notifications) using the configured library timezone.
 */
const startOfDay = (date = new Date()) => dayjs(date).startOf('day').toDate();
const endOfDay = (date = new Date()) => dayjs(date).endOf('day').toDate();

const addDays = (date, days) => dayjs(date).add(days, 'day').toDate();

/** Whole days `date` is past `reference`; 0 when not yet past. */
function daysOverdue(dueDate, reference = new Date()) {
  const diff = dayjs(reference).startOf('day').diff(dayjs(dueDate).startOf('day'), 'day');
  return diff > 0 ? diff : 0;
}

const daysUntil = (date, reference = new Date()) =>
  dayjs(date).startOf('day').diff(dayjs(reference).startOf('day'), 'day');

const formatDate = (date, tz = 'UTC', pattern = 'YYYY-MM-DD') =>
  (date ? dayjs(date).tz(tz).format(pattern) : '');

const formatDateTime = (date, tz = 'UTC') => formatDate(date, tz, 'YYYY-MM-DD HH:mm');

/** Converts "HH:mm" to minutes from midnight; null when malformed. */
function timeToMinutes(value) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

module.exports = {
  dayjs, startOfDay, endOfDay, addDays, daysOverdue, daysUntil,
  formatDate, formatDateTime, timeToMinutes,
};
