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
 * downgraded to a GET.
 *
 * Telling a local run apart from a real plain-HTTP request is the whole difficulty here. The
 * hostname cannot do it: `wrangler dev` presents a routed request as the *production* hostname
 * (`http://cancoder.chesterhillsolutions.ca/`) no matter which local port it is served on, and it
 * populates `request.cf` too. The client address can: a request from the local machine is one this
 * process is serving directly, and there is no certificate to redirect it to. The check is written
 * so that only an *observed* loopback address skips the redirect — a request with no client address
 * at all is still redirected.
 */

import { isLoopbackHost } from './utils';

/** IPv4 loopback, IPv6 loopback, or an IPv4-mapped IPv6 loopback address. */
function isLoopbackAddress(address: string): boolean {
  const value = address.trim().toLowerCase();
  if (value === '::1') return true;
  const ipv4 = value.startsWith('::ffff:') ? value.slice('::ffff:'.length) : value;
  return /^127\./.test(ipv4);
}

export function forceHttpsRedirect(request: Request): Response | null {
  const url = new URL(request.url);
  if (url.protocol !== 'http:') return null;
  if (isLoopbackHost(url.hostname)) return null;

  const clientAddress = request.headers.get('CF-Connecting-IP');
  if (clientAddress && isLoopbackAddress(clientAddress)) return null;

  url.protocol = 'https:';
  return Response.redirect(url.toString(), 308);
}
