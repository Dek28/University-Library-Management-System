import { create } from 'zustand';

const STORAGE_KEY = 'ulms-theme';

const systemTheme = () =>
  (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

const read = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'dark' || saved === 'light' ? saved : 'system';
  } catch {
    return 'system';
  }
};

const write = (preference) => {
  try {
    if (preference === 'system') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // A browser with storage disabled still themes for the current session.
  }
};

const paint = (resolved) => {
  document.documentElement.dataset.theme = resolved;
};

/**
 * Theme preference.
 *
 * `preference` is what the user chose (including "follow the system");
 * `resolved` is the theme actually on screen. The inline script in index.html
 * has already applied the correct one before React mounts, so this store
 * starts in agreement with the document rather than fighting it.
 */
export const useThemeStore = create((set, get) => {
  const preference = read();

  return {
    preference,
    resolved: preference === 'system' ? systemTheme() : preference,

    setPreference(next) {
      const resolved = next === 'system' ? systemTheme() : next;
      write(next);
      paint(resolved);
      set({ preference: next, resolved });
    },

    /** Flips between light and dark, leaving "system" behind deliberately. */
    toggle() {
      get().setPreference(get().resolved === 'dark' ? 'light' : 'dark');
    },

    /** Called once at mount: keeps a "system" preference in step with the OS. */
    subscribeToSystem() {
      const media = window.matchMedia?.('(prefers-color-scheme: dark)');
      if (!media) return () => {};

      const onChange = (event) => {
        if (get().preference !== 'system') return;
        const resolved = event.matches ? 'dark' : 'light';
        paint(resolved);
        set({ resolved });
      };

      media.addEventListener('change', onChange);
      return () => media.removeEventListener('change', onChange);
    },
  };
});
