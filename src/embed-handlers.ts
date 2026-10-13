/**
 * The `/embed.js` HTTP handler.
 *
 * It lives here rather than in `embed.ts` because `embed.ts` is typechecked by `tsconfig.dom.json`
 * (it is imported by the jsdom widget test), and importing the Worker context into it drags
 * `@cloudflare/workers-types` into the DOM program, which cannot coexist with the DOM lib. Keeping
 * `embed.ts` import-free is what lets both typecheck projects pass; this module holds the HTTP
 * concern instead.
 */

import { badRequest } from './utils';
import { isOdaSuggestEnabled } from './oda-config';
import { createEmbedScript, EMBED_VERSION } from './embed';
import type { RouteContext } from './route-context';

/**
 * `/embed.js` — the drop-in widget. Gated on the same flag as `/api/search`: a widget whose only
 * data source is unregistered would fail silently on the integrator's page, worse than a 404.
 */
export function handleEmbedScript(ctx: RouteContext): Response {
  if (!isOdaSuggestEnabled(ctx.env)) {
    return badRequest('Address autocomplete is not enabled', 404, 'NOT_FOUND', ctx.correlationId);
  }
  return new Response(createEmbedScript(ctx.url.origin), {
    headers: {
      'content-type': 'application/javascript; charset=UTF-8',
      'Cache-Control': 'public, max-age=300, s-maxage=3600',
      'X-Embed-Version': EMBED_VERSION,
      ...ctx.corsHeaders(ctx.request.headers.get('Origin')),
    },
  });
}
