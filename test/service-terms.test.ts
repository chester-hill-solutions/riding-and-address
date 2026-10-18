import { describe, it, expect } from 'vitest';
import { createServiceTerms, SUPPORT_URL } from '../src/service-terms';
import { AREA_MAX_RESULTS, AREA_UNIT_PRICE_USD, AREA_UNIT_RECORDS, areaPriceUsd } from '../src/offers';
import { createOpenAPISpec } from '../src/docs';
import { PROVINCIAL_DATASETS, FEDERAL_DATASET } from '../src/datasets';
import { KEY_DENIAL_REASONS, httpStatusForKeyDenial } from '../src/api-keys';
import { DEFAULT_FREE_MONTHLY_ALLOWANCE } from '../src/customer';
import { UPLOAD_ROW_PRICE_USD } from '../src/upload-sheet';
import { DEFAULT_DEMO_RATE_LIMIT, DEFAULT_RATE_LIMIT } from '../src/utils';
import { ROUTES } from '../src/routes';
import { createLookupTestEnv, fetchLookup } from './helpers/lookup-test-env';

/**
 * `/.well-known/cancoder.json` is the W4 machine-readable terms document. The whole point is that
 * an agent reads the *configured* values, so these assert the document is built from the same
 * constants the Worker and Portal enforce — not a second copy that can drift.
 */

const ORIGIN = 'https://lookup.test';

describe('machine-readable service terms', () => {
  const terms = () => createServiceTerms(ORIGIN);

  it('serialises to JSON, since it is served verbatim at /.well-known/cancoder.json', () => {
    expect(() => JSON.stringify(terms())).not.toThrow();
  });

  it('publishes the configured price and upload minimum', () => {
    const { pricing } = terms();
    expect(pricing.currency).toBe('USD');
    expect(pricing.unitPrice).toBe(UPLOAD_ROW_PRICE_USD);
    expect(pricing.uploadRowPrice).toBe(UPLOAD_ROW_PRICE_USD);
    expect(pricing.uploadMinimumCharge).toBe(0.5);
  });

  it('publishes the area product as its own unit, not inferred from the lookup price', () => {
    const { pricing, capabilities } = terms();
    expect(pricing.area.unitRecords).toBe(AREA_UNIT_RECORDS);
    expect(pricing.area.unitPrice).toBe(AREA_UNIT_PRICE_USD);
    expect(pricing.area.maxRecordsPerOffer).toBe(AREA_MAX_RESULTS);
    // A point lookup and a 250-record area unit are different things.
    expect(pricing.area.unitPrice).not.toBe(pricing.unitPrice);

    const area = capabilities.find((capability) => capability.id === 'area');
    expect(area).toBeTruthy();
    expect(area?.endpoints).toContain(`${ORIGIN}/api/area`);
    expect(area?.endpoints).toContain(`${ORIGIN}/api/quote?operation=area.search`);
  });

  it('publishes an area unit price the quote path actually charges', () => {
    // The document and the offer path disagree only if these diverge.
    expect(areaPriceUsd(AREA_UNIT_RECORDS)).toBe(terms().pricing.area.unitPrice);
  });

  it('describes the area unit without also claiming the rail is off', () => {
    // The note is about pricing. Whether records can be bought is the `payment` block's job, and this
    // document said "not yet enabled" for a morning after the rail was switched on — so the state is
    // stated in exactly one place, derived from the config.
    expect(terms().pricing.area.note).toMatch(/250-record units/);
    expect(terms().pricing.area.note).not.toMatch(/not yet enabled/i);
  });

  it('publishes the configured free allowance', () => {
    expect(terms().freeTier.allowance).toBe(DEFAULT_FREE_MONTHLY_ALLOWANCE);
  });

  it('publishes the configured rate limits, demo throttle included', () => {
    const { rateLimits } = terms();
    expect(rateLimits.keyed.requestsPerMinute).toBe(DEFAULT_RATE_LIMIT);
    expect(rateLimits.demo.requestsPerMinute).toBe(DEFAULT_DEMO_RATE_LIMIT);
    expect(rateLimits.demo.billable).toBe(false);
  });

  it('publishes coverage from the dataset registry', () => {
    const { coverage } = terms();
    expect(coverage.federal.path).toBe(FEDERAL_DATASET.path);
    expect(coverage.federal.year).toBe(FEDERAL_DATASET.year);
    expect(coverage.provincial.map((d) => d.path)).toEqual(
      PROVINCIAL_DATASETS.map((d) => d.path)
    );
    expect(coverage.provincial.map((d) => d.year)).toEqual(
      PROVINCIAL_DATASETS.map((d) => d.year)
    );
    expect(coverage.jurisdictionsWithoutAddressData).toEqual(['NL', 'NU', 'YT']);
  });

  it('publishes the auth error vocabulary with the enforced statuses', () => {
    const { auth: published } = terms().errors;
    expect(published.map((e) => e.code)).toEqual([...KEY_DENIAL_REASONS]);
    for (const entry of published) {
      expect(entry.httpStatus).toBe(httpStatusForKeyDenial(entry.code));
    }
  });

  it('claims no payment capability when the rail is not configured', () => {
    // The default deployment has no rail, so nothing is claimed — the plan's rule that discovery
    // publishes only what is live.
    expect(terms()).not.toHaveProperty('payment');
    expect(terms()).not.toHaveProperty('paymentOptions');
    expect(terms().pricing).not.toHaveProperty('paymentMethods');
  });

  it('declares the payment capability, from the config the Worker settles with', () => {
    // This is the failure the block exists to prevent: the rail went live and the terms kept saying
    // accepting an offer was "not yet enabled", so agents were told they could not buy.
    const paid = createServiceTerms(ORIGIN, {
      protocol: 'x402',
      version: 2,
      scheme: 'exact',
      network: 'eip155:8453',
      asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      perPayerDailyCapUsd: 25,
    });

    expect(paid.payment?.accountFree.network).toBe('eip155:8453');
    expect(paid.payment?.accountFree.asset).toBe('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
    expect(paid.payment?.accountFree.requiresAccount).toBe(false);
    expect(paid.payment?.accountFree.howToPay).toContain('/api/quote/accept');
    // And it never claims the rail is off, which is what it said while live.
    expect(paid.pricing.area.note).not.toMatch(/not yet enabled/i);
    expect(JSON.stringify(paid)).not.toMatch(/not yet enabled/i);
  });

  it('points support at the same target as the OpenAPI contact', () => {
    const spec = createOpenAPISpec(ORIGIN) as unknown as {
      info: { contact?: { url?: string } };
    };
    expect(terms().support.url).toBe(SUPPORT_URL);
    expect(spec.info.contact?.url).toBe(SUPPORT_URL);
  });

  it('resolves its links against the host that served it', () => {
    const other = createServiceTerms('https://cancoder.chesterhillsolutions.ca');
    expect(other.docs.guide).toBe('https://cancoder.chesterhillsolutions.ca/docs/agents.md');
    expect(other.capabilities.find((c) => c.id === 'mcp')?.endpoints).toEqual([
      'https://cancoder.chesterhillsolutions.ca/mcp',
    ]);
  });
});

describe('GET /.well-known/cancoder.json', () => {
  it('is classified internal so it stays out of the OpenAPI path set', () => {
    const entry = ROUTES.find(
      (candidate) => Array.isArray(candidate.path) && candidate.path.includes('/.well-known/cancoder.json')
    );
    expect(entry?.owner).toBe('api');
    expect(entry?.visibility).toBe('internal');
  });

  it('returns the terms as JSON on the request host', async () => {
    const env = { ...createLookupTestEnv(), PUBLIC_API_HOSTS: 'lookup.test' } as never;
    const response = await fetchLookup(env, '/.well-known/cancoder.json');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    const body = (await response.json()) as { pricing: { unitPrice: number }; docs: { openapi: string } };
    expect(body.pricing.unitPrice).toBe(UPLOAD_ROW_PRICE_USD);
    expect(body.docs.openapi).toBe(`${ORIGIN}/api/docs`);
  });
});
