import { useAuthStore } from '../store/auth';

/**
 * Whether the library charges fines (Settings → Circulation → Charge fines).
 * When off, every fines screen, column, card and figure is hidden.
 * Reads as on until settings have loaded, matching the server's default.
 */
export default function useFinesEnabled() {
  return useAuthStore((state) => state.settings?.circulation?.finesEnabled !== false);
}
