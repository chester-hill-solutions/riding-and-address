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

  it('says the area records cannot be bought yet, rather than leaving the gap unexplained', () => {
    // Quoting is live; acceptance returns 503. An agent should learn that here, not by trial.
    expect(terms().pricing.area.note).toMatch(/not yet enabled/i);
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

  it('claims no payment options, since none is live', () => {
    expect(terms()).not.toHaveProperty('paymentOptions');
    expect(terms().pricing).not.toHaveProperty('paymentMethods');
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
