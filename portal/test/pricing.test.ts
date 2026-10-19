import { describe, expect, it } from 'vitest';

import { formatMeteredUnitPrice } from '~/lib/pricing';

/**
 * What the portal tells a person the price is.
 *
 * The billing-invariants gate already keeps the `$0.005` literal out of every file except the
 * one that owns it, and keeps the free allowance identical between the Worker and the portal.
 * What neither of those can see is the *rendered* price: `formatMeteredUnitPrice` builds the
 * string, and a change to how it builds it — one fewer decimal place, a currency symbol in the
 * wrong place — would show a customer a price the charge does not match, with every other gate
 * still green.
 */
describe('the displayed metered price', () => {
  it('is the price the upload policy charges, to three decimal places', () => {
    expect(formatMeteredUnitPrice()).toBe('$0.005');
  });
});
