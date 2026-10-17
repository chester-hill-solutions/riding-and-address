/**
 * Upgrade a plain-HTTP request to HTTPS before anything else runs.
 *
 * The Worker sees the client's scheme in `request.url`, so a request that arrives over plain HTTP is
 * otherwise served in full — and even emits `http://` canonical links. HSTS only applies to a repeat
 * visit, so the *first* plain-HTTP request needs this. The zone's `always_use_https` setting is off
 * (checked 2026-10-17); this covers the CanCoder Worker without changing a setting shared with the
 * other projects on the zone, and it covers the `workers.dev` hostname, which no zone setting
 * reaches.
 *
 * `308` preserves the method and the body, so a POST to the API is redirected rather than silently
 * downgraded to a GET. Loopback hosts are left alone: local development serves plain HTTP and has no
 * certificate to redirect to.
 */

import { isLoopbackHost } from './utils';

export function forceHttpsRedirect(request: Request): Response | null {
  const url = new URL(request.url);
  if (url.protocol !== 'http:') return null;
  if (isLoopbackHost(url.hostname)) return null;

  url.protocol = 'https:';
  return Response.redirect(url.toString(), 308);
}
