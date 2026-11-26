import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Backend origin without the /api/v1 suffix, e.g. http://10.10.26.159:9990
  const backendOrigin = (env.VITE_API_URL || 'http://10.10.26.159:9990/api/v1').replace(/\/api\/v\d+\/?$/, '');

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5173,
      // Listen on all interfaces so http://10.10.26.159:5173 works, not only localhost.
      host: true,
      open: false,
      // Same-origin API in dev → refresh cookie stays first-party, no CORS (see src/lib/api/baseApi.ts).
      proxy: {
        '/api/v1': { target: backendOrigin, changeOrigin: true, xfwd: true },
      },
    },
  };
});
