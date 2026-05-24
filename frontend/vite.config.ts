import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { readFileSync } from 'fs';

const pkg = JSON.parse(
  readFileSync(path.resolve(__dirname, 'package.json'), 'utf8'),
) as { version: string };

// Base path is set via `VITE_BASE_PATH` env at build time:
//   • Vercel (root):     VITE_BASE_PATH=/   (default)
//   • GitHub Pages:      VITE_BASE_PATH=/beija
// Falls back to './' so file://-served dev builds also work.
const BASE_PATH = process.env.VITE_BASE_PATH ?? './';

export default defineConfig({
  base: BASE_PATH,
  plugins: [react()],
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version),
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-observability': ['@sentry/react', 'posthog-js', 'web-vitals'],
          'vendor-i18n': ['i18next', 'react-i18next', 'i18next-browser-languagedetector'],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
      '/uploads': { target: 'http://localhost:4000', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:4000', ws: true, changeOrigin: true },
    },
  },
});
