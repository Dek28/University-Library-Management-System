import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// The proxy makes API calls same-origin from the browser's point of view, so
// the Origin header is dropped: the API's CORS allow-list only names
// localhost, and a phone on the LAN would otherwise be refused.
const stripOrigin = (proxy) => {
  proxy.on('proxyReq', (proxyReq) => proxyReq.removeHeader('origin'));
};

export default defineConfig(({ mode }) => {
  // `npm run dev:https` (mode "lan"): self-signed HTTPS on every network
  // interface, so phones can open the app and use the camera scanner.
  const lan = mode === 'lan';

  return {
    plugins: [react(), tailwindcss(), ...(lan ? [basicSsl()] : [])],
    server: {
      port: 5173,
      host: lan ? true : undefined,
      // The API base URL is relative in development, so the proxy keeps the
      // browser on one origin and the refresh cookie is sent normally.
      proxy: {
        '/api': { target: 'http://localhost:5000', changeOrigin: true, configure: stripOrigin },
        '/uploads': { target: 'http://localhost:5000', changeOrigin: true, configure: stripOrigin },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      rolldownOptions: {
        output: {
          // Long-lived vendor chunks, so app deploys don't invalidate them.
          codeSplitting: {
            groups: [
              { name: 'react', test: /[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/ },
              { name: 'charts', test: /[\\/]node_modules[\\/](recharts|victory-vendor|d3-[^\\/]+)[\\/]/ },
              { name: 'query', test: /[\\/]node_modules[\\/]@tanstack[\\/]/ },
            ],
          },
        },
      },
    },
  };
});
