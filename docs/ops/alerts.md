# Alerts (Workers Observability)

## Sources

- Cloudflare Workers Observability is enabled in `wrangler.jsonc`.
- Circuit open events log structured JSON: `{ "alert": "circuit_open", "key": "…", … }` from `src/circuit-breaker.ts`.
- Elevated 5xx: watch Worker metrics / log drain for status ≥ 500 and `LOOKUP_ERROR` / `UNEXPECTED_ERROR`.
  - **`LOOKUP_TIMEOUT` (503) is not in that set.** A stage timeout is transient, and it is terminal
    for every lookup shape, so a cold start or a slow D1 can produce one. It carries `Retry-After`
    and the caller is expected to retry, so it should not page like a 500. Alert on it only as a rate
    — a sustained climb means something is genuinely slow, not cold.

## Recommended queries / notifications

1. **Circuit open** — log search for `"alert":"circuit_open"` → page on-call / notify Slack.
2. **5xx rate** — alert when 5xx / request rate exceeds a staging baseline (start at >1% over 5 minutes).
3. **Demo abuse** — spike of 429 on `/api/demo/*` (IP fuse via `DEMO_RATE_LIMIT`).

## Staging dry-run

1. Deploy `--env staging`.
2. Force geocoder failures (invalid token) until circuit opens; confirm Observability shows the `circuit_open` line.
3. Restore token; confirm recovery to CLOSED / HALF_OPEN without deploy.

## Related

- `ALERTS_ENABLED` var (informational; circuit logs always emit JSON today).
- Fuse / billing alerts are Customer-side (portal email when soft-warn); not CF Observability.
