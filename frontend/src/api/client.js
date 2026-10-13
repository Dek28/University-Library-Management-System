import axios from 'axios';
import toast from 'react-hot-toast';

const BASE_URL = `${import.meta.env.VITE_API_URL || ''}/api/v1`;

/**
 * The access token lives in memory only. It never touches localStorage, so
 * an XSS bug cannot read it back. Session continuity comes from the HTTP-only
 * refresh cookie the API sets, which is replayed on a cold start.
 */
let accessToken = null;
let onSessionLost = () => {};

export const setAccessToken = (token) => { accessToken = token; };
export const getAccessToken = () => accessToken;
export const onUnauthorized = (handler) => { onSessionLost = handler; };

const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
  timeout: 30000,
});

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

// Concurrent 401s must trigger exactly one refresh; the rest wait for it.
let refreshPromise = null;

async function refreshSession() {
  if (!refreshPromise) {
    refreshPromise = axios
      .post(`${BASE_URL}/auth/refresh`, {}, { withCredentials: true })
      .then((res) => {
        const token = res.data?.data?.accessToken;
        setAccessToken(token);
        return { token, user: res.data?.data?.user };
      })
      .finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config, response } = error;

    if (response?.status === 401 && config && !config._retried && !config.url?.includes('/auth/')) {
      config._retried = true;
      try {
        const { token } = await refreshSession();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
          return api(config);
        }
      } catch {
        // Refresh itself failed, so the session is genuinely over.
      }
      setAccessToken(null);
      onSessionLost();
    }

    // Normalise every failure into a predictable shape for the UI.
    let data = response?.data;
    // File requests receive their JSON error body as a Blob.
    if (data instanceof Blob && data.type.includes('json')) {
      try { data = JSON.parse(await data.text()); } catch { data = null; }
    }
    return Promise.reject({
      status: response?.status || 0,
      message: data?.message
        || (error.code === 'ECONNABORTED' ? 'The request timed out' : null)
        || (!response ? 'Cannot reach the server. Check your connection.' : 'Something went wrong'),
      errors: data?.errors || [],
      raw: error,
    });
  },
);

export { refreshSession };
export default api;

/** Unwraps the API success envelope. */
export const unwrap = (response) => response.data?.data;

/** Unwraps a paginated envelope into `{ items, meta }`. */
export const unwrapList = (response) => ({
  items: response.data?.data || [],
  meta: response.data?.meta || { page: 1, limit: 20, total: 0, totalPages: 0 },
});

/**
 * Warns when the API cut an export short at its row ceiling.
 *
 * The file carries the same notice in its own header line, but nobody opens a
 * download to check whether it is complete, so it is raised here too.
 */
function warnIfTruncated(response) {
  const flag = response.headers['x-export-truncated'];
  if (!flag) return;

  const [shown, total] = String(flag).split('/').map(Number);
  if (!Number.isFinite(shown) || !Number.isFinite(total)) return;

  toast(
    `Export limited to ${shown.toLocaleString()} of ${total.toLocaleString()} records. `
    + 'Narrow the filters or date range to export the rest.',
    { icon: '⚠️', duration: 8000 },
  );
}

/**
 * Triggers a browser download for an export endpoint.
 * Exports stream binary data, so the blob is fetched with the auth header
 * attached rather than by navigating to the URL.
 */
export async function downloadFile(url, params = {}, fallbackName = 'export') {
  const response = await api.get(url, { params, responseType: 'blob' });
  warnIfTruncated(response);

  const disposition = response.headers['content-disposition'] || '';
  const match = /filename="?([^";]+)"?/.exec(disposition);
  const filename = match ? decodeURIComponent(match[1]) : fallbackName;

  const href = URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
  return filename;
}
