import api, { unwrap, unwrapList, downloadFile } from './client';

/**
 * Every backend call the app makes, grouped by domain.
 * Components never build URLs themselves, so a route change touches one file.
 */

export const authApi = {
  login: (payload) => api.post('/auth/login', payload).then(unwrap),
  logout: () => api.post('/auth/logout').then(unwrap),
  me: () => api.get('/auth/me').then(unwrap),
  changePassword: (payload) => api.post('/auth/change-password', payload).then(unwrap),
  forgotPassword: (payload) => api.post('/auth/forgot-password', payload).then((r) => r.data),
  resetPassword: (payload) => api.post('/auth/reset-password', payload).then((r) => r.data),
  revokeSessions: () => api.post('/auth/revoke-sessions').then(unwrap),
};

export const userApi = {
  list: (params) => api.get('/users', { params }).then(unwrapList),
  get: (id) => api.get(`/users/${id}`).then(unwrap),
  activity: (id) => api.get(`/users/${id}/activity`).then(unwrap),
  lookup: (identifier) => api.get('/users/lookup', { params: { identifier } }).then(unwrap),
  create: (payload) => api.post('/users', payload).then(unwrap),
  update: (id, payload) => api.patch(`/users/${id}`, payload).then(unwrap),
  changeStatus: (id, payload) => api.patch(`/users/${id}/status`, payload).then(unwrap),
  resetPassword: (id, payload) => api.post(`/users/${id}/reset-password`, payload).then(unwrap),
  remove: (id) => api.delete(`/users/${id}`).then(unwrap),
  updateOwnProfile: (payload) => api.patch('/users/me/profile', payload).then(unwrap),
  downloadTemplate: () => downloadFile('/users/import/template', {}, 'student-import-template.xlsx'),
  // Options go in the form body: a default password must not end up in a URL or access log.
  import: (file, options) => {
    const form = new FormData();
    form.append('file', file);
    Object.entries(options).forEach(([key, value]) => form.append(key, String(value)));
    return api.post('/users/import', form).then(unwrap);
  },
  export: (params, format) => downloadFile('/users', { ...params, format }, `users.${format}`),
};

export const referenceApi = {
  collections: () => api.get('/reference').then(unwrap),
  list: (collection, params) => api.get(`/reference/${collection}`, { params }).then(unwrapList),
  get: (collection, id) => api.get(`/reference/${collection}/${id}`).then(unwrap),
  create: (collection, payload) => api.post(`/reference/${collection}`, payload).then(unwrap),
  update: (collection, id, payload) => api.patch(`/reference/${collection}/${id}`, payload).then(unwrap),
  remove: (collection, id) => api.delete(`/reference/${collection}/${id}`).then(unwrap),
};

export const authorApi = {
  // Read-only: authors are registered from the book form via `authorNames`.
  list: (params) => api.get('/authors', { params }).then(unwrapList),
};

export const resourceApi = {
  search: (params) => api.get('/resources', { params }).then(unwrapList),
  suggest: (q) => api.get('/resources/suggest', { params: { q } }).then(unwrap),
  discovery: () => api.get('/resources/discovery').then(unwrap),
  get: (id) => api.get(`/resources/${id}`).then(unwrap),
  related: (id) => api.get(`/resources/${id}/related`).then(unwrap),
  create: (payload) => api.post('/resources', payload).then(unwrap),
  update: (id, payload) => api.patch(`/resources/${id}`, payload).then(unwrap),
  remove: (id) => api.delete(`/resources/${id}`).then(unwrap),
  uploadCover: (id, file) => {
    const form = new FormData();
    form.append('cover', file);
    return api.post(`/resources/${id}/cover`, form).then(unwrap);
  },
  export: (params, format) => downloadFile('/resources', { ...params, format }, `catalogue.${format}`),
  downloadImportTemplate: () => downloadFile('/resources/import/template', {}, 'catalogue-import-template.xlsx'),
  // Reads the file's columns and the suggested column -> form field mapping.
  inspectImport: (file) => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/resources/import/inspect', form, { timeout: 120000 }).then(unwrap);
  },
  import: (file, { mapping, dryRun, createMissing }) => {
    const form = new FormData();
    form.append('file', file);
    form.append('mapping', JSON.stringify(mapping));
    form.append('dryRun', String(Boolean(dryRun)));
    form.append('createMissing', String(Boolean(createMissing)));
    // A large file with many copies can take a while to write.
    return api.post('/resources/import', form, { timeout: 0 }).then(unwrap);
  },
};

export const copyApi = {
  list: (params) => api.get('/resource-copies', { params }).then(unwrapList),
  get: (id) => api.get(`/resource-copies/${id}`).then(unwrap),
  lookup: (identifier) => api.get('/resource-copies/lookup', { params: { identifier } }).then(unwrap),
  create: (payload) => api.post('/resource-copies', payload).then(unwrap),
  createBatch: (payload) => api.post('/resource-copies/batch', payload).then(unwrap),
  update: (id, payload) => api.patch(`/resource-copies/${id}`, payload).then(unwrap),
  remove: (id) => api.delete(`/resource-copies/${id}`).then(unwrap),
};

export const loanApi = {
  list: (params) => api.get('/loans', { params }).then(unwrapList),
  get: (id) => api.get(`/loans/${id}`).then(unwrap),
  deskSummary: () => api.get('/loans/desk-summary').then(unwrap),
  eligibility: (params) => api.get('/loans/eligibility', { params }).then(unwrap),
  issue: (payload) => api.post('/loans/issue', payload).then(unwrap),
  return: (payload) => api.post('/loans/return', payload).then(unwrap),
  renew: (id, payload) => api.post(`/loans/${id}/renew`, payload || {}).then(unwrap),
  markLost: (id, payload) => api.post(`/loans/${id}/lost`, payload).then(unwrap),
  renewals: (params) => api.get('/loans/renewals', { params }).then(unwrapList),
  receipt: (id) => downloadFile(`/loans/${id}/receipt`, {}, `loan-${id}.pdf`),
  export: (params, format) => downloadFile('/loans', { ...params, format }, `loans.${format}`),
};

export const reservationApi = {
  list: (params) => api.get('/reservations', { params }).then(unwrapList),
  get: (id) => api.get(`/reservations/${id}`).then(unwrap),
  create: (payload) => api.post('/reservations', payload).then(unwrap),
  cancel: (id, payload) => api.post(`/reservations/${id}/cancel`, payload || {}).then(unwrap),
  expireStale: () => api.post('/reservations/expire-stale').then(unwrap),
};

export const fineApi = {
  list: (params) => api.get('/fines', { params }).then(unwrapList),
  get: (id) => api.get(`/fines/${id}`).then(unwrap),
  summary: (params) => api.get('/fines/summary', { params }).then(unwrap),
  myOutstanding: () => api.get('/fines/my-outstanding').then(unwrap),
  forUser: (userId) => api.get(`/fines/user/${userId}/outstanding`).then(unwrap),
  create: (payload) => api.post('/fines', payload).then(unwrap),
  pay: (id, payload) => api.post(`/fines/${id}/payments`, payload).then(unwrap),
  waive: (id, payload) => api.post(`/fines/${id}/waive`, payload).then(unwrap),
  cancel: (id, payload) => api.post(`/fines/${id}/cancel`, payload).then(unwrap),
  payments: (params) => api.get('/fines/payments', { params }).then(unwrapList),
  receipt: (id) => downloadFile(`/fines/${id}/receipt`, {}, `fine-${id}.pdf`),
  export: (params, format) => downloadFile('/fines', { ...params, format }, `fines.${format}`),
};

export const digitalApi = {
  list: (params) => api.get('/digital-resources', { params }).then(unwrapList),
  get: (id) => api.get(`/digital-resources/${id}`).then(unwrap),
  upload: (file, fields, onProgress) => {
    const form = new FormData();
    form.append('file', file);
    Object.entries(fields).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      form.append(key, Array.isArray(value) ? value.join(',') : value);
    });
    return api.post('/digital-resources', form, {
      onUploadProgress: (e) => onProgress?.(Math.round((e.loaded * 100) / (e.total || 1))),
    }).then(unwrap);
  },
  update: (id, payload) => api.patch(`/digital-resources/${id}`, payload).then(unwrap),
  remove: (id) => api.delete(`/digital-resources/${id}`).then(unwrap),
  download: (id, name) => downloadFile(`/digital-resources/${id}/download`, {}, name || 'document.pdf'),
  // The file itself, for the in-app reader. Fetched with the auth header, so it
  // cannot be opened by pasting a URL.
  read: (id, { signal } = {}) => api
    .get(`/digital-resources/${id}/read`, { responseType: 'blob', timeout: 0, signal })
    .then((response) => response.data),
};

export const inventoryApi = {
  summary: (params) => api.get('/inventory/summary', { params }).then(unwrap),
  copiesByStatus: (status, params) => api.get(`/inventory/copies/${status}`, { params }).then(unwrapList),
  adjustCopy: (copyId, payload) => api.patch(`/inventory/copies/${copyId}/adjust`, payload).then(unwrap),
  audits: (params) => api.get('/inventory/audits', { params }).then(unwrapList),
  audit: (id) => api.get(`/inventory/audits/${id}`).then(unwrap),
  startAudit: (payload) => api.post('/inventory/audits', payload).then(unwrap),
  recordItem: (id, payload) => api.post(`/inventory/audits/${id}/items`, payload).then(unwrap),
  completeAudit: (id, payload) => api.post(`/inventory/audits/${id}/complete`, payload || {}).then(unwrap),
  cancelAudit: (id, payload) => api.post(`/inventory/audits/${id}/cancel`, payload || {}).then(unwrap),
};

export const purchaseOrderApi = {
  list: (params) => api.get('/purchase-orders', { params }).then(unwrapList),
  export: (params, format) => downloadFile('/purchase-orders', { ...params, format }, `book-orders.${format}`),
  summary: () => api.get('/purchase-orders/summary').then(unwrap),
  get: (id) => api.get(`/purchase-orders/${id}`).then(unwrap),
  create: (payload) => api.post('/purchase-orders', payload).then(unwrap),
  update: (id, payload) => api.patch(`/purchase-orders/${id}`, payload).then(unwrap),
  place: (id) => api.post(`/purchase-orders/${id}/place`).then(unwrap),
  receive: (id, payload) => api.post(`/purchase-orders/${id}/receive`, payload).then(unwrap),
  pay: (id, payload) => api.post(`/purchase-orders/${id}/pay`, payload).then(unwrap),
  cancel: (id, payload) => api.post(`/purchase-orders/${id}/cancel`, payload || {}).then(unwrap),
  downloadInvoice: (id, code) => downloadFile(`/purchase-orders/${id}/invoice`, {}, `invoice-${code || id}.pdf`),
  // Opens the PDF in a new tab for printing. The tab is opened before the
  // request so popup blockers treat it as part of the click.
  printInvoice: async (id) => {
    const tab = window.open('', '_blank');
    try {
      const response = await api.get(`/purchase-orders/${id}/invoice`, { params: { inline: 'true' }, responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      if (tab) tab.location.href = url;
      else window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      tab?.close();
      throw error;
    }
  },
};

export const clearanceApi = {
  list: (params) => api.get('/clearance', { params }).then(unwrapList),
  get: (id) => api.get(`/clearance/${id}`).then(unwrap),
  check: (params) => api.get('/clearance/check', { params }).then(unwrap),
  statistics: () => api.get('/clearance/statistics').then(unwrap),
  requestFor: (userId) => api.post('/clearance', { user: userId }).then(unwrap),
  requestOwn: () => api.post('/clearance/request').then(unwrap),
  myStatus: () => api.get('/clearance/my-status').then(unwrap),
  approve: (id, payload) => api.post(`/clearance/${id}/approve`, payload || {}).then(unwrap),
  reject: (id, payload) => api.post(`/clearance/${id}/reject`, payload).then(unwrap),
  certificate: (id, code) => downloadFile(`/clearance/${id}/certificate`, {}, `clearance-${code || id}.pdf`),
  export: (params, format) => downloadFile('/clearance', { ...params, format }, `clearance.${format}`),
};

export const groupApi = {
  list: (params) => api.get('/reading-groups', { params }).then(unwrapList),
  get: (id) => api.get(`/reading-groups/${id}`).then(unwrap),
  create: (payload) => api.post('/reading-groups', payload).then(unwrap),
  update: (id, payload) => api.patch(`/reading-groups/${id}`, payload).then(unwrap),
  setMembers: (id, payload) => api.post(`/reading-groups/${id}/members`, payload).then(unwrap),
  remove: (id) => api.delete(`/reading-groups/${id}`).then(unwrap),
  sessions: (params) => api.get('/reading-groups/sessions', { params }).then(unwrapList),
  session: (id) => api.get(`/reading-groups/sessions/${id}`).then(unwrap),
  scheduleSession: (payload) => api.post('/reading-groups/sessions', payload).then(unwrap),
  updateSession: (id, payload) => api.patch(`/reading-groups/sessions/${id}`, payload).then(unwrap),
  cancelSession: (id, payload) => api.post(`/reading-groups/sessions/${id}/cancel`, payload || {}).then(unwrap),
  recordAttendance: (id, entries) => api.post(`/reading-groups/sessions/${id}/attendance`, { entries }).then(unwrap),
  schedule: (params) => api.get('/reading-groups/schedule', { params }).then(unwrap),
  statistics: (params) => api.get('/reading-groups/statistics', { params }).then(unwrap),
};

export const dashboardApi = {
  admin: () => api.get('/dashboard/admin').then(unwrap),
  librarian: () => api.get('/dashboard/librarian').then(unwrap),
  me: () => api.get('/dashboard/me').then(unwrap),
};

export const reportApi = {
  list: () => api.get('/reports').then(unwrap),
  overview: (params) => api.get('/reports/overview', { params }).then(unwrap),
  run: (key, params) => api.get(`/reports/${key}`, { params }).then(unwrap),
  export: (key, params, format) => downloadFile(`/reports/${key}`, { ...params, format }, `${key}.${format}`),
};

export const notificationApi = {
  list: (params) => api.get('/notifications', { params }).then(unwrapList),
  unreadCount: () => api.get('/notifications/unread-count').then(unwrap),
  markRead: (ids) => api.post('/notifications/read', { ids }).then(unwrap),
  markAllRead: () => api.post('/notifications/read-all').then(unwrap),
  remove: (id) => api.delete(`/notifications/${id}`).then(unwrap),
  broadcast: (payload) => api.post('/notifications/broadcast', payload).then(unwrap),
};

export const adminApi = {
  settings: () => api.get('/settings').then(unwrap),
  publicSettings: () => api.get('/settings/public').then(unwrap),
  updateSettings: (payload) => api.patch('/settings', payload).then(unwrap),
  uploadLogo: (file) => {
    const form = new FormData();
    form.append('logo', file);
    return api.post('/settings/logo', form).then(unwrap);
  },
  roles: () => api.get('/roles').then(unwrap),
  permissions: () => api.get('/roles/permissions').then(unwrap),
  createRole: (payload) => api.post('/roles', payload).then(unwrap),
  updateRole: (id, payload) => api.patch(`/roles/${id}`, payload).then(unwrap),
  auditLogs: (params) => api.get('/audit-logs', { params }).then(unwrapList),
};
