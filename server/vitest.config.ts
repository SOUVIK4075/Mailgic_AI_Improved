import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    // One in-memory MongoDB per test file; run files one after another to keep it simple.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 60000,
  },
});
