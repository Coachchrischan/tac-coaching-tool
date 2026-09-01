// Vitest gets its own config so the test runner never loads the app's Vite
// plugins (the storage plugin's backup timers kept the process alive).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
