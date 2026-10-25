import { QueryClient } from '@tanstack/react-query';

/**
 * Shared cache for server data. It is cleared whenever the signed-in user
 * changes (see store/auth.js), so one person's data is never shown to the next
 * person who signs in on the same browser.
 */
export const queryClient = new QueryClient({
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
