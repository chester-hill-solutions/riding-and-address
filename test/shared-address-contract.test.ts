import { describe, expect, it } from 'vitest';
import { canadianAddressFixtures } from '@chester-hill-solutions/validation/fixtures/canadian-address';
import { normalizePostalCode, normalizeProvince } from '../src/oda-normalize';
import { formatCanadaPostAddress } from '../src/canada-post-format';
import { createLookupTestEnv, fetchLookup } from './helpers/lookup-test-env';
import { createOdaFixtureEnv } from './helpers/oda-memory-db';
import { validatePostalCode } from '../src/utils';

describe('shared Canadian address contract', () => {
  it.each(canadianAddressFixtures)('formats $postal / $province consistently with CHS consumers', (fixture) => {
    expect(normalizePostalCode(fixture.postal)).toBe(fixture.expectedPostal);
    expect(normalizeProvince(fixture.province)).toBe(fixture.expectedProvince);
    const mailing = formatCanadaPostAddress({
      civicNumber: '123', streetName: 'Main', streetType: 'ST', city: 'Example',
      province: fixture.province, postalCode: fixture.postal,
    });
    expect(mailing.postalCode).toBe(fixture.expectedPostal);
    expect(mailing.province).toBe(fixture.expectedProvince);
    expect(mailing.canadaPostCertified).toBe(false);
  });
  it('keeps numeric dataset IDs and international fallback in the app adapter', () => {
    expect(normalizeProvince('35')).toBe('ON');
    expect(normalizeProvince('24')).toBe('QC');
    expect(validatePostalCode(' sw1a  1aa ')).toEqual({ valid: true, sanitized: 'SW1A 1AA' });
    expect(validatePostalCode('90210')).toEqual({ valid: true, sanitized: '90210' });
    expect(validatePostalCode('')).toEqual({ valid: true });
    expect(validatePostalCode(' '.repeat(25))).toEqual({ valid: false, error: 'Postal code format is invalid or too long' });
  });
});

describe('CHS HTTP adoption preserves the API envelope', () => {
  it('retains address fields, status, security, correlation and CORS on success', async () => {
    const { d1 } = createOdaFixtureEnv();
    const env = { ...createLookupTestEnv(), ODA_DB: d1, ODA_GEOCODING_ENABLED: 'true', ODA_PROVINCES: 'ON' };
    for (const path of ['geocode', 'normalize-address']) {
      const response = await fetchLookup(env, `/api/demo/${path}?postal=m5v2t6&province=Ontario`, {
        headers: { 'X-Correlation-ID': `shared-${path}`, Origin: 'https://example.test' },
      });
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('application/json; charset=UTF-8');
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      expect(response.headers.get('access-control-allow-origin')).toBe('*');
      expect(response.headers.get('x-correlation-id')).toBe(`shared-${path}`);
      const body = await response.json();
      expect(body).toMatchObject({
        geocodeMethod: 'postal_centroid', confidence: expect.any(Number),
        correlationId: `shared-${path}`,
        mailingAddress: { postalCode: 'M5V 2T6', province: 'ON', canadaPostCertified: false },
      });
    }
  });
});
