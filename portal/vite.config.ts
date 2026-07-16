import { reactRouter } from '@react-router/dev/vite';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [reactRouter(), tsconfigPaths()],
  resolve: {
    // The @chester-hill-solutions/* file: packages carry their own drizzle-orm
    // resolution; dedupe so the bundle contains a single drizzle instance
    // (duplicate instances break instanceof checks at runtime).
    dedupe: ['drizzle-orm'],
  },
  ssr: {
    // Bundle the CHS packages during SSR so their drizzle-orm imports go
    // through Vite's resolver (and the dedupe above) instead of Node's
    // real-path resolution, which would load the workspace's own copy.
    noExternal: [/@chester-hill-solutions\//],
  },
});
