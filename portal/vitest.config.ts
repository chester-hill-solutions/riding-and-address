import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * The portal's unit tests.
 *
 * A separate config from `vite.config.ts`, because that one runs the Cloudflare plugin: it starts
 * a Workers environment, which is what the build and `npm run dev` need and the opposite of what a
 * unit test needs. The alias is spelled out rather than taken from `vite-tsconfig-paths`, because
 * the tsconfig that carries it is `tsconfig.cloudflare.json` — the one the Cloudflare plugin's
 * project uses — and a test should not depend on which project a plugin happens to select.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '~': fileURLToPath(new URL('./app', import.meta.url)),
    },
  },
});
