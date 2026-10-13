import { create } from 'zustand';
import { authApi } from '../api/endpoints';
import { setAccessToken, refreshSession, onUnauthorized } from '../api/client';

/**
 * Session state.
 *
 * `permissions` is the authoritative list the API returned for this account.
 * The UI uses it to hide what a user cannot do. The server still enforces
 * every rule, so a tampered client gains nothing.
 */
export const useAuthStore = create((set, get) => ({
  user: null,
  permissions: [],
  status: 'loading', // loading | authenticated | anonymous
  settings: null,

  async bootstrap() {
    try {
      // A valid refresh cookie survives a page reload; the access token does not.
      const { token, user } = await refreshSession();
      if (!token) throw new Error('no session');
      const profile = user || (await authApi.me());
      set({ user: profile, permissions: profile.permissions || [], status: 'authenticated' });
    } catch {
      setAccessToken(null);
      set({ user: null, permissions: [], status: 'anonymous' });
    }
  },

  async login(credentials) {
    const result = await authApi.login(credentials);
    setAccessToken(result.accessToken);
    set({
      user: result.user,
      permissions: result.user.permissions || [],
      status: 'authenticated',
    });
    return result.user;
  },

  async logout() {
    try {
      await authApi.logout();
    } finally {
      setAccessToken(null);
      set({ user: null, permissions: [], status: 'anonymous' });
    }
  },

  async reloadProfile() {
    const profile = await authApi.me();
    set({ user: profile, permissions: profile.permissions || [] });
    return profile;
  },

  setSettings: (settings) => set({ settings }),

  clearSession() {
    setAccessToken(null);
    set({ user: null, permissions: [], status: 'anonymous' });
  },

  /** True when the account holds every listed permission. */
  can: (...required) => required.every((p) => get().permissions.includes(p)),

  /** True when the account holds at least one of the listed permissions. */
  canAny: (...required) => required.some((p) => get().permissions.includes(p)),

  roleKey: () => get().user?.role?.key,
}));

// A refresh failure anywhere in the app drops the session exactly once.
onUnauthorized(() => useAuthStore.getState().clearSession());
