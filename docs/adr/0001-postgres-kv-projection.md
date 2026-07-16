# Portal D1 canonical; KV edge projection for API keys

**Status:** Accepted (amended 2026-07-16)

Customer, User, and billing state live in the portal **D1** database (`PORTAL_DB`). API keys and Customer config used on billable API paths are projected into Cloudflare KV. Portal mutations call projection helpers **in-process** inside the same Worker (no HTTP self-loop). An optional Bearer admin API (`/admin/projection/*`) remains for operator tooling.

**History:** v1 of this ADR used Postgres (Railway) as the canonical store and HTTP projection. CanCoder is now Workers + D1 only; see CHS ADR-0009 (`auth-d1` path).

**Considered:** Portal writing KV via Cloudflare API (wider blast radius); API routes reading D1 on every request (extra latency vs hashed-key KV lookup).
