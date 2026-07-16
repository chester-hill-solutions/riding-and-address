import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // The integration tests cold-import the full worker graph; under parallel
    // full-suite load that can exceed vitest's 5s default on contended runners.
    testTimeout: 60000,
    hookTimeout: 60000,
    // Cap workers so cold worker imports don't starve each other of CPU.
    maxWorkers: 4,
  },
});
