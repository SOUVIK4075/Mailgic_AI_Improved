import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // In development the React app runs on :5173 and Express on :4000.
    // Proxying /api makes every request same-origin, so the httpOnly auth cookies just work.
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
  build: {
    outDir: 'dist', // Express serves client/dist in production
  },
});
