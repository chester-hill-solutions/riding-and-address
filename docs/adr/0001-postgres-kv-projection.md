# Postgres canonical; KV edge projection via Worker admin API

Customer, User, and billing state live in Postgres (portal). API keys and Customer config used at the edge are projected into Cloudflare KV. The portal never holds a Cloudflare API token; it calls a Worker admin projection API with an operator secret so revoke can delete KV synchronously.

**Considered:** Portal writing KV via Cloudflare API (wider blast radius); Worker reading Postgres on every request (latency and coupling).
