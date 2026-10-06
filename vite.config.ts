import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { storagePlugin } from './src/server/storagePlugin.js';
import { teamPushPlugin } from './src/server/teamPushPlugin.js';
import { weekPackPlugin } from './src/server/weekPackPlugin.js';
import { thPullPlugin } from './src/server/thPullPlugin.js';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), storagePlugin(), teamPushPlugin(), weekPackPlugin(), thPullPlugin()],
  server: {
    port: 8127,
    strictPort: true,
    host: '127.0.0.1',
    // The store backend writes data/*.json on every autosave; without this the
    // watcher full-reloads the page ~800ms after each edit, resetting UI state.
    watch: { ignored: ['**/data/**'] },
  },
});
