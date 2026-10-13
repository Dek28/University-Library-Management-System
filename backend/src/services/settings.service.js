const SystemSetting = require('../models/SystemSetting');
const { DEFAULT_BORROWING_RULES, DEFAULT_FINE_POLICIES } = require('../models/SystemSetting');
const ApiError = require('../utils/ApiError');

/**
 * Settings are read on nearly every circulation request, so the single global
 * document is cached in-process with a short TTL and invalidated on write.
 */
const CACHE_TTL_MS = 30_000;
let cache = { value: null, expiresAt: 0 };

const invalidate = () => { cache = { value: null, expiresAt: 0 }; };

async function getSettings({ fresh = false } = {}) {
  if (!fresh && cache.value && cache.expiresAt > Date.now()) return cache.value;

  let doc = await SystemSetting.findOne({ key: 'global' });
  if (!doc) doc = await SystemSetting.create(SystemSetting.defaults());

  cache = { value: doc.toObject(), expiresAt: Date.now() + CACHE_TTL_MS };
  return cache.value;
}

async function updateSettings(patch, actorId) {
  const doc = (await SystemSetting.findOne({ key: 'global' }))
    || (await SystemSetting.create(SystemSetting.defaults()));

  const before = doc.toObject();
  // `key` is immutable and must never be reassigned from a request payload.
  const { key, _id, id, ...safePatch } = patch || {};
  doc.set({ ...safePatch, updatedBy: actorId || null });
  await doc.save();
  invalidate();
  return { before, after: doc.toObject() };
}

/** Borrowing entitlement for a role, falling back to the student rule. */
async function getBorrowingRule(roleKey) {
  const settings = await getSettings();
  const rules = settings.borrowingRules?.length ? settings.borrowingRules : DEFAULT_BORROWING_RULES;
  return rules.find((r) => r.roleKey === roleKey)
    || rules.find((r) => r.roleKey === 'student')
    || DEFAULT_BORROWING_RULES[0];
}

/** Fine policy for a resource type, falling back to the `default` policy. */
async function getFinePolicy(resourceType) {
  const settings = await getSettings();
  const policies = settings.finePolicies?.length ? settings.finePolicies : DEFAULT_FINE_POLICIES;
  return policies.find((p) => p.resourceType === resourceType)
    || policies.find((p) => p.resourceType === 'default')
    || DEFAULT_FINE_POLICIES[0];
}

/** Whether the library charges fines at all (Settings → Circulation). */
async function finesEnabled() {
  const settings = await getSettings();
  return settings.circulation?.finesEnabled !== false;
}

async function getTimezone() {
  const settings = await getSettings();
  return settings.locale?.timezone || 'UTC';
}

async function getCurrency() {
  const settings = await getSettings();
  return { code: settings.locale?.currency || 'USD', symbol: settings.locale?.currencySymbol || '$' };
}

/** Throws when a file exceeds the configured upload ceiling. */
async function assertUploadAllowed(file, kind = 'document') {
  const settings = await getSettings();
  const allowed = kind === 'image'
    ? settings.uploads.allowedImageTypes
    : settings.uploads.allowedDocumentTypes;
  if (!allowed.includes(file.mimetype)) {
    throw ApiError.badRequest(`File type ${file.mimetype} is not permitted`);
  }
  const maxBytes = settings.uploads.maxFileSizeMb * 1024 * 1024;
  if (file.size > maxBytes) {
    throw ApiError.badRequest(`File exceeds the ${settings.uploads.maxFileSizeMb}MB limit`);
  }
  return true;
}

module.exports = {
  getSettings, updateSettings, invalidate,
  getBorrowingRule, getFinePolicy, finesEnabled, getTimezone, getCurrency, assertUploadAllowed,
};
