declare const process: { env: Record<string, string | undefined> };
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the app calls /api/... and Vite forwards it to the backend (so no CORS setup is needed).
export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.VITE_PORT) || 5173,
    host: true,
    proxy: {
      '/api': { target: process.env.API_TARGET || 'http://127.0.0.1:4000', changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') },
    },
  },
});
