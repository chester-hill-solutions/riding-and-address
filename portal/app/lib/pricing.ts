import { UPLOAD_ROW_PRICE_USD } from '../../../src/upload-sheet';

/**
 * Portal display defaults for free allowance and metered unit price.
 * Upload row pricing comes from the same policy that calculates Checkout quotes.
 * Existing API meter pricing remains configured independently in Stripe.
 *
 * Worker free-allowance fallback lives in src/customer.ts (DEFAULT_FREE_MONTHLY_ALLOWANCE).
 * Keep both numeric defaults identical; the billing-invariants gate enforces that.
 */
export const DEFAULT_FREE_MONTHLY_ALLOWANCE = 1000;

/** Displayed per-successful-row price, shared with the upload quote policy. */
export const METERED_UNIT_PRICE_USD = UPLOAD_ROW_PRICE_USD;

export function formatMeteredUnitPrice(): string {
  return `$${METERED_UNIT_PRICE_USD.toFixed(3)}`;
}
