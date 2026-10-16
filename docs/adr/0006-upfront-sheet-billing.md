# One-time upload payments and account-scoped free allowance

CanCoder spreadsheet uploads use an upfront quote and a single Stripe Checkout payment (`mode=payment`), rather than a recurring metered subscription. Existing API metering remains separate; upload processing does not emit meter events or grant an unrestricted API plan.

The price remains USD 0.005 per successful row after 1,000 free rows per UTC month. The API and upload allowance share the same per-customer Durable Object counter. Quotes reserve all usable rows and existing credits atomically before payment. Only one pending upload is permitted per customer. Cancelling or expiring an unpaid quote returns its reservation. Checkout reservations are released only after Stripe confirms expiry, preventing late paid webhooks from racing a guessed timeout.

Balances are stored as integer half-cent row credits. Checkout charges whole USD cents, with a USD 0.50 card minimum. Any minimum/rounding surplus remains credit, disclosed in the quote. Failed paid rows become reusable account credit; failed free rows return to that month's free allowance. Retries cannot settle or credit a job twice. Funds are account credit, not an automatic cash refund.

Only verified email accounts may upload or mint new free API keys. A canonical email identity may claim the free allowance for one customer; common Gmail dot/plus aliases and plus aliases on other domains do not create another grant. Customer counters are stored on the server and shared across team members, browsers, cleared cookies and private windows. New signups also share a durable network bucket (five attempts per IP per UTC day) across both signup entry points, using an HMAC rather than storing the raw IP. This reduces account farming; it does not establish one allowance per human or defeat multiple real email addresses and networks.

The upload uses the existing Customer Durable Object for reservations, credits, progress and alarms. Progress is checkpointed per row. A valid signed webhook must match the stored Checkout ID, Stripe customer, payment mode, currency, amount and paid status before processing begins. A successful redirect never activates a job. Customer-scoped authenticated routes guard quotes, results and downloads.

CSV files are limited to 1 MiB, 10,000 rows, 50 columns and 4,000 UTF-8 bytes per row. Malformed CSV is rejected. Invalid rows are skipped without charge; original columns are retained and exported cells are neutralized against spreadsheet formula injection. Up to 20 uploads per workspace per day bounds abuse and seven-day retained history. Inputs/results expire after seven days; row-credit balances persist.

Production paid uploads remain disabled until the live account, email verification delivery and product/legal setup are ready. Staging uses a restricted test key and test webhook, with no production custom-domain route or storage inheritance.
