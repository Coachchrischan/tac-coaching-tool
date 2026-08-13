import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { storagePlugin } from './src/server/storagePlugin.js';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), storagePlugin()],
  server: {
    port: 8127,
    strictPort: true,
    host: '127.0.0.1',
  },
});
