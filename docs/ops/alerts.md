# Alerts (Workers Observability)

## Sources

- Cloudflare Workers Observability is enabled in `wrangler.jsonc`.
- Circuit open events log structured JSON: `{ "alert": "circuit_open", "key": "…", … }` from `src/circuit-breaker.ts`.
- Elevated 5xx: watch Worker metrics / log drain for status ≥ 500 and `LOOKUP_ERROR` / `UNEXPECTED_ERROR`.

## Recommended queries / notifications

1. **Circuit open** — log search for `"alert":"circuit_open"` → page on-call / notify Slack.
2. **5xx rate** — alert when 5xx / request rate exceeds a staging baseline (start at >1% over 5 minutes).
3. **Demo abuse** — spike of 429 on `/api/demo/*` (IP fuse via `DEMO_RATE_LIMIT`).

## Staging dry-run

1. Deploy `--env staging`.
2. Force geocoder failures (invalid token) until circuit opens; confirm Observability shows the `circuit_open` line.
3. Restore token; confirm recovery to CLOSED / HALF_OPEN without deploy.

## Webhook inbox (email alerts)

`POST|GET /hooks/inbox/<token>` accepts **any** method, content type and body, and emails the full
request (method, URL, headers, query, body) to `INBOX_TO` using the Cloudflare Email Service
`SEND_EMAIL` binding. The token is a secret (`wrangler secret put INBOX_TOKEN`) carried in the
path, so the URL is a drop-in webhook target for any service; a missing/wrong token is a 404, so it
is not an open mail relay. Without the binding configured the route returns 503.

Config: `portal/wrangler.jsonc` (`send_email` binding, `INBOX_FROM`, `INBOX_TO`). The `from` domain
must be onboarded with `wrangler email sending enable <domain>`; the binding's
`destination_address` restricts delivery to one verified address.

Used by `scripts/nar-daily.sh` via `NAR_ALERT_WEBHOOK`: a failed nightly NAR refresh emails its log
line. Set that env var in the systemd unit (`ops/nar-daily.service`).

## Related

- `ALERTS_ENABLED` var (informational; circuit logs always emit JSON today).
- Fuse / billing alerts are Customer-side (portal email when soft-warn); not CF Observability.
