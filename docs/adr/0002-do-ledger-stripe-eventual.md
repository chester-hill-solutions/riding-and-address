# Durable Object usage ledger is billing truth; Stripe sync is eventual

Successful Billable units increment a per-Customer Durable Object ledger first. Stripe Billing Meter events are synced asynchronously from that ledger. If Stripe is unavailable, the API still returns 200 and we alert — we never fail-closed on billing for a geographic lookup.

**Considered:** Fail-closed on Stripe errors (ties availability to billing); reporting only to Stripe without a local ledger (harder fuse/reconcile).
