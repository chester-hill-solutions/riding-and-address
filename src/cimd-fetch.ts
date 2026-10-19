/**
 * The CIMD transport: fetching a client's metadata document, bounded.
 *
 * A `client_id` may be an HTTPS URL, and the authorization server fetches a metadata document from
 * it. That makes a client-supplied string into an outbound request, which is the definition of an
 * SSRF surface — so `@better-auth/cimd` requires the transport to "resolve the hostname exactly once,
 * reject RFC 6890 special-use addresses, pin the approved address for the connection, and refuse
 * redirects". See `docs/adr/0010-mcp-client-registration-cimd.md` for the full argument; the short
 * version is that the platform provides the address rejection, we provide the rest, and the one
 * requirement we cannot implement is also one we cannot need.
 *
 * **Why this lives in `src/` rather than beside the portal's auth config**, where it is used: the
 * repo's test runner covers `test/`, and a portal module is reachable only from the portal's own
 * runtime smoke test. A security boundary with no unit tests is the thing this repository's
 * conventions exist to prevent, so it lives where it can be tested.
 */
/**
 * The shape `@better-auth/cimd` requires of a transport: a `fetch` drop-in.
 *
 * Declared here rather than imported from `@better-auth/oauth-provider`, because that package is a
 * dependency of the portal and this module is in the API worker's tree — importing it would make the
 * root typecheck depend on the portal's install. The shapes are structurally identical, so the
 * plugin accepts this without a cast.
 */
export type ClientMetadataResourceFetch = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Response | Promise<Response>;

/** The read cap the CIMD draft recommends. The document is client-controlled and unbounded. */
export const CIMD_MAX_BYTES = 5 * 1024;

/** Bounded so a slow or hostile host cannot hold an authorization request open. */
export const CIMD_TIMEOUT_MS = 5_000;

/**
 * Hosts refused before any request is made.
 *
 * The platform refuses private network IPs, `localhost` and Cloudflare's own ranges at connection
 * time — documented under `connect()`'s troubleshooting, and `fetch` cannot target an address at all.
 * This check exists anyway, for the part that is ours: a **literal** address is the one form we can
 * recognise without resolving anything, and refusing it here fails the request earlier and with a
 * clearer reason than a platform error would.
 *
 * Names that merely *resolve* to a special-use address are the platform's business. We cannot resolve
 * them, so pretending to check would be the guard-that-cannot-fail shape.
 */
export function isSpecialUseHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host === 'local' || host.endsWith('.local') || host.endsWith('.internal')) return true;

  // IPv4, including the decimal and hex-in-disguise forms are NOT handled here — a hostname that
  // parses as an address is what this catches, not every spelling of one. The platform is the
  // backstop for the rest.
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local, and the cloud metadata address
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
    if (a >= 224) return true; // multicast and reserved
    return false;
  }

  if (host.includes(':')) {
    if (host === '::1' || host === '::') return true;
    // IPv4-mapped IPv6, in both the dotted and the all-hex spelling.
    if (host.startsWith('::ffff:')) return true;
    if (/^f[cd][0-9a-f]{2}:/.test(host)) return true; // unique local
    if (/^fe[89ab][0-9a-f]:/.test(host)) return true; // link local
    return false;
  }

  return false;
}

/**
 * Fetch a metadata document, or throw.
 *
 * Throws rather than returning a synthetic error response, because every failure here is a refusal:
 * the CIMD draft says an authorization request whose metadata cannot be fetched SHOULD be aborted,
 * and a Response the caller might treat as a document is the wrong shape for that.
 */
export const fetchClientMetadataResource: ClientMetadataResourceFetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const parsed = new URL(url);

  if (parsed.protocol !== 'https:') {
    throw new Error(`cimd: refusing ${parsed.protocol} — a metadata document must be served over HTTPS`);
  }
  if (isSpecialUseHost(parsed.hostname)) {
    throw new Error('cimd: refusing a special-use address');
  }

  // `redirect: 'error'` is the contract's "refuse redirects". Following one would let a document
  // arrive from somewhere other than the URL that identifies the client — and the URL *is* the
  // client's identity here.
  const response = await fetch(url, {
    ...init,
    redirect: 'error',
    signal: AbortSignal.timeout(CIMD_TIMEOUT_MS),
  });
  if (!response.ok || !response.body) return response;

  // Read at most the cap. The document is client-controlled and the server cannot bound its size, so
  // the read is bounded instead: stopping at the cap and refusing is the draft's own recommendation,
  // and it is also what stops a 10 GB "document" from being buffered.
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > CIMD_MAX_BYTES) {
      await reader.cancel();
      throw new Error(`cimd: metadata document exceeds ${CIMD_MAX_BYTES} bytes`);
    }
    chunks.push(value);
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new Response(body, {
    status: response.status,
    headers: response.headers,
  });
};
