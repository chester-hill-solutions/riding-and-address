import { reactRouter } from '@react-router/dev/vite';
import { cloudflare } from '@cloudflare/vite-plugin';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [
    // Runs the Worker (this app + the src/worker.ts API worker it wraps — see workers/app.ts)
    // in the real Workers runtime for `npm run dev`, and produces the deployable build for
    // `npm run build` + `wrangler deploy`. wrangler.jsonc lives alongside this file.
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    reactRouter(),
    tsconfigPaths(),
  ],
  resolve: {
    // The @chester-hill-solutions/* file: packages carry their own drizzle-orm
    // resolution; dedupe so the bundle contains a single drizzle instance
    // (duplicate instances break instanceof checks at runtime).
    dedupe: ['drizzle-orm'],
  },
  // No explicit `ssr.noExternal` here: @cloudflare/vite-plugin's worker environment already
  // defaults `resolve.noExternal` to `true` (bundle everything, including the CHS file:
  // packages' drizzle-orm imports, through Vite's resolver/dedupe above). Adding an explicit
  // `ssr.noExternal` array on top merges into `[<pattern>, true]`, which crashes Vite 6
  // (`filename.replace is not a function` — https://github.com/cloudflare/workers-sdk/issues/9036).
});
