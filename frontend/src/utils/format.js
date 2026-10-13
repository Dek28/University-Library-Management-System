import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

export const formatDate = (value, fallback = '-') =>
  (value ? dayjs(value).format('DD MMM YYYY') : fallback);

export const formatDateTime = (value, fallback = '-') =>
  (value ? dayjs(value).format('DD MMM YYYY, HH:mm') : fallback);

export const formatInputDate = (value) => (value ? dayjs(value).format('YYYY-MM-DD') : '');

export const fromNow = (value) => (value ? dayjs(value).fromNow() : '-');

/** Whole days until a date; negative once it has passed. */
export const daysUntil = (value) => dayjs(value).startOf('day').diff(dayjs().startOf('day'), 'day');

export const isOverdue = (dueDate) => dayjs(dueDate).isBefore(dayjs(), 'day');

export const formatMoney = (amount, symbol = '$') => {
  const value = Number(amount || 0);
  return `${symbol}${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const formatNumber = (value) => Number(value || 0).toLocaleString();

/**
 * A shelf's location label, e.g. "Health Sciences · Rack 4". Matches the name
 * the API derives; older shelves without a section and rack show their name.
 */
export const shelfLabel = (shelf, fallback = '-') => {
  if (!shelf) return fallback;
  if (shelf.section && shelf.rack) {
    const rack = /^rack\b/i.test(shelf.rack) ? shelf.rack : `Rack ${shelf.rack}`;
    return `${shelf.section} · ${rack}`;
  }
  return shelf.name || fallback;
};

export const formatBytes = (bytes) => {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};

/** Turns an enum value such as `severely_damaged` into "Severely damaged". */
export const humanize = (value) => {
  if (!value) return '';
  const text = String(value).replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
};

export const fullName = (user) => {
  if (!user) return '';
  return [user.firstName, user.middleName, user.lastName].filter(Boolean).join(' ');
};

export const initials = (user) => {
  if (!user) return '?';
  const name = fullName(user) || user.email || '';
  return name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '?';
};

export const memberIdentifier = (user) => user?.registrationNumber || user?.employeeId || user?.email || '-';

export const truncate = (text, max = 80) =>
  (text && text.length > max ? `${text.slice(0, max).trimEnd()}…` : text || '');

/** Strips empty values so they never reach the API as blank filters. */
export const cleanParams = (params = {}) =>
  Object.entries(params).reduce((acc, [key, value]) => {
    if (value === '' || value === null || value === undefined || value === 'all') return acc;
    acc[key] = value;
    return acc;
  }, {});
