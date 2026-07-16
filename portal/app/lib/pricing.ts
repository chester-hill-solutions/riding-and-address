/**
 * Portal display defaults for free allowance and metered unit price.
 * Stripe Price (STRIPE_PRICE_METERED) is authoritative for Checkout amounts —
 * this constant is marketing/UI copy only and must stay in sync with docs.
 *
 * Worker free-allowance fallback lives in src/customer.ts (DEFAULT_FREE_MONTHLY_ALLOWANCE).
 * Keep both numeric defaults identical; the billing-invariants gate enforces that.
 */
export const DEFAULT_FREE_MONTHLY_ALLOWANCE = 1000;

/** Documented metered overage unit price in USD (display only). */
export const METERED_UNIT_PRICE_USD = 0.005;

export function formatMeteredUnitPrice(): string {
  return `$${METERED_UNIT_PRICE_USD.toFixed(3)}`;
}
