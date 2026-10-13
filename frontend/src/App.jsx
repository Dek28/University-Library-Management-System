import { useEffect } from 'react';
import { RouterProvider } from 'react-router/dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import router from './routes';
import { useAuthStore } from './store/auth';
import { useThemeStore } from './store/theme';
import { adminApi } from './api/endpoints';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Auth failures are handled by the axios interceptor, so retrying them
      // here would only delay the redirect to the sign-in screen.
      retry: (failureCount, error) => failureCount < 2 && ![401, 403, 404].includes(error?.status),
      refetchOnWindowFocus: false,
      staleTime: 15_000,
    },
    mutations: { retry: false },
  },
});

/** Restores the session and loads institution settings before the app renders. */
function Bootstrap({ children }) {
  const bootstrap = useAuthStore((state) => state.bootstrap);
  const status = useAuthStore((state) => state.status);
  const setSettings = useAuthStore((state) => state.setSettings);

  const subscribeToSystem = useThemeStore((state) => state.subscribeToSystem);

  useEffect(() => { bootstrap(); }, [bootstrap]);

  // A "follow the system" preference has to keep following it after load.
  useEffect(() => subscribeToSystem(), [subscribeToSystem]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    // Institution name, currency and timezone are needed across the whole UI.
    adminApi.settings()
      .catch(() => adminApi.publicSettings())
      .then((settings) => settings && setSettings(settings))
      .catch(() => {});
  }, [status, setSettings]);

  return children;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Bootstrap>
        <RouterProvider router={router} />
      </Bootstrap>
      {/* Toast chrome reads from the same variables as the rest of the app, so
          it follows the theme without a second palette to keep in step. */}
      <Toaster
        position="top-right"
        gutter={10}
        toastOptions={{
          duration: 4000,
          style: {
            borderRadius: '14px',
            border: '1px solid rgb(var(--line))',
            background: 'rgb(var(--panel))',
            color: 'rgb(var(--n-800))',
            fontSize: '13px',
            lineHeight: '1.35rem',
            padding: '10px 14px',
            maxWidth: '26rem',
            boxShadow: '0 1px 2px rgb(var(--shadow) / 0.06), 0 12px 32px -8px rgb(var(--shadow) / 0.18)',
          },
          success: { iconTheme: { primary: 'rgb(var(--solid-success))', secondary: 'rgb(var(--on-solid))' } },
          error: {
            duration: 6000,
            iconTheme: { primary: 'rgb(var(--solid-danger))', secondary: 'rgb(var(--on-solid))' },
          },
        }}
      />
    </QueryClientProvider>
  );
}
