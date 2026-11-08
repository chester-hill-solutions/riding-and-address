/**
 * The public origin of a deployed application.
 *
 * The public origin is the address that a browser uses to reach the
 * application. It is the base of every absolute link that the application
 * sends, and it is the value that the origin of a request must match.
 *
 * On Railway the platform publishes the public domain as a host name without a
 * scheme, so the helper adds the scheme. A trailing slash is removed, because
 * a browser sends the origin without one, and a request origin must compare
 * equal to the configured origin.
 */

/** The public origin, or an empty string when no host has configured one. */
export function appPublicOrigin(): string {
  const railway = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
  if (railway) {
    if (/^https?:\/\//i.test(railway)) return railway.replace(/\/$/, "");
    return `https://${railway.replace(/\/$/, "")}`;
  }
  const fromApp = process.env.APP_PUBLIC_ORIGIN?.trim();
  if (fromApp) return fromApp.replace(/\/$/, "");
  return "";
}

/**
 * The origins that a redirect may use. The list holds the public origin and
 * the origins that the host configured. A host that names no origin gets the
 * fallback.
 */
export function authTrustedOrigins(fallback = "http://localhost:5173"): string[] {
  const fromEnv = (process.env.APP_TRUSTED_ORIGINS ?? fallback)
    .split(/[,;\s]+/)
    .map((value) => value.trim())
    .filter(Boolean);
  const publicOrigin = appPublicOrigin();
  const merged = publicOrigin ? [publicOrigin, ...fromEnv] : fromEnv;
  return [...new Set(merged)];
}

/** Raised when an absolute app URL is needed and no public origin is configured. */
export class MissingPublicOriginError extends Error {
  constructor() {
    super(
      "No public origin is configured: set APP_PUBLIC_ORIGIN (or RAILWAY_PUBLIC_DOMAIN) so an absolute app URL is built from the configured origin instead of the request"
    );
    this.name = "MissingPublicOriginError";
  }
}

/**
 * An absolute address of the application.
 *
 * The origin comes from the configuration alone. A request carries the origin
 * the caller reached the application on, so a Host header would decide where an
 * authentication link points; that is a trust decision, and it is not the
 * request's to make. When no origin is configured the call fails closed rather
 * than falling back to the request's origin.
 *
 * The resolved URL must also stay on that configured origin. Protocol-relative,
 * backslash and whitespace forms are checked after URL parsing, not by a prefix rule.
 * The request parameter is kept for callers that already pass one.
 */
export function absoluteAppUrl(_request: Request, pathname: string): string {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const origin = appPublicOrigin();
  if (!origin) {
    throw new MissingPublicOriginError();
  }
  const base = new URL(origin);
  const resolved = new URL(path, base);
  if (resolved.origin !== base.origin) {
    throw new TypeError("absoluteAppUrl: the path must stay on the application's origin");
  }
  return resolved.href;
}
