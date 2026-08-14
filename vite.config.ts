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
    // The store backend writes data/*.json on every autosave; without this the
    // watcher full-reloads the page ~800ms after each edit, resetting UI state.
    watch: { ignored: ['**/data/**'] },
  },
});
