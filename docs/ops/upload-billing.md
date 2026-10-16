# Upload billing operations

Build and deploy the portal using the intended environment. `portal/wrangler.jsonc` gives staging an explicit empty routes list and separate customer/session storage. Never deploy a compiled staging bundle to the production custom domain.

Required: AUTH_SECRET, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, RESEND_API_KEY and a verified EMAIL_FROM sender. Set UPLOAD_CHECKOUT_ENABLED=true only for the intended payment environment. Production's flag defaults off. The old PAID_CHECKOUT_ENABLED flag does not open subscription checkout.

Register checkout.session.completed at /api/stripe/webhook. The restricted Stripe key needs Customers and Checkout Sessions write access; Customer Portal access is used to manage existing payment details. Billing Meter Events remains for existing API metering. Uploads use inline one-time Checkout pricing; no recurring price or meter is required.

Run root validation, portal typecheck/build and portal test:runtime. The runtime test uses local D1/KV and marks only disposable local fixture users verified, without delivering mail. It tests signature verification in the actual Worker runtime, email gating, upload quotes, background processing, private CSV downloads, tenant isolation and cross-origin mutation rejection.

In staging, create a synthetic verified account and upload 1,001 usable rows to exercise the first paid row and the 50-cent card minimum. Use Stripe's sandbox card only. Confirm the quote shows 1,000 free rows, one paid row and 99 extra row credits. Complete Checkout, verify the signed webhook activates only that job, and confirm failed rows become credits once processing finishes. A paid upload must never turn the customer's API plan into metered or emit billing meter events. Test cancellation and expired Checkout reservations separately.

The current staging Stripe test account is CanCoder (acct_1URFiqCDe9lqVid6). Its checkout webhook destination is we_1URGGWCDe9lqVid6DsNsOssg. Secret values must stay in Worker secrets, never in source, screenshots or logs. The earlier recurring test product/price are unused by uploads.
