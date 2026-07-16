import type { Config } from '@react-router/dev/config';

export default {
  ssr: true,
  // Aligns RR's SSR build output directory name with Vite's Environment API name ("ssr", per
  // vite.config.ts's `cloudflare({ viteEnvironment: { name: "ssr" } })`) instead of RR's classic
  // "server" — required for @cloudflare/vite-plugin + React Router (see the official
  // react-router-starter-template in cloudflare/templates).
  future: {
    v8_viteEnvironmentApi: true,
  },
} satisfies Config;
