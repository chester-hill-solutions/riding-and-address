import { describe, it, expect } from 'vitest';
import { join } from 'path';
import { expandCityCandidates } from '../src/oda-city-aliases';
import { geocodeWithOda, OdaGeocodeError } from '../src/oda-geocoding';
import { createOdaFixtureEnv } from './helpers/oda-memory-db';
import { Env } from '../src/types';

function aliasEnv(): Env {
  const { d1 } = createOdaFixtureEnv(join(process.cwd(), 'test/fixtures/oda/fixture-aliases.csv'));
  return {
    RIDINGS: {} as R2Bucket,
    ODA_DB: d1,
    ODA_GEOCODING_ENABLED: 'true',
    ODA_PROVINCES: 'ON,QC',
    ODA_MIN_CONFIDENCE: '0.6',
  };
}

describe('expandCityCandidates', () => {
  it('puts the caller spelling first so it can outrank aliases', () => {
    expect(expandCityCandidates('Toronto', 'ON')[0]).toBe('TORONTO');
    expect(expandCityCandidates('Hamilton', 'ON')[0]).toBe('HAMILTON');
  });

  it('expands Toronto to the six pre-amalgamation municipalities', () => {
    const candidates = expandCityCandidates('Toronto', 'ON');
    for (const municipality of [
      'FORMER TORONTO',
      'SCARBOROUGH',
      'NORTH YORK',
      'ETOBICOKE',
      'YORK',
      'EAST YORK',
    ]) {
      expect(candidates).toContain(municipality);
    }
  });

  it('expands a plain name to its administrative-prefixed form', () => {
    expect(expandCityCandidates('Hamilton', 'ON')).toContain('CITY OF HAMILTON');
    expect(expandCityCandidates('Huntsville', 'ON')).toContain('TOWN OF HUNTSVILLE');
  });

  it('maps Quebec to the QUEBEC CITY spelling, folding accents', () => {
    expect(expandCityCandidates('Québec', 'QC')).toContain('QUEBEC CITY');
    expect(expandCityCandidates('Quebec', 'QC')).toContain('QUEBEC CITY');
  });

  it('strips a legal prefix the caller supplied, and applies aliases to the result', () => {
    const candidates = expandCityCandidates('City of Toronto', 'ON');
    expect(candidates).toContain('TORONTO');
    expect(candidates).toContain('SCARBOROUGH');
  });

  it('scopes aliases by province', () => {
    expect(expandCityCandidates('Toronto', 'ON')).toContain('SCARBOROUGH');
    expect(expandCityCandidates('Toronto', 'QC')).not.toContain('SCARBOROUGH');
  });

  it('returns nothing for an empty city', () => {
    expect(expandCityCandidates(undefined, 'ON')).toEqual([]);
    expect(expandCityCandidates('   ', 'ON')).toEqual([]);
  });
});

describe('ODA geocoding through city aliases', () => {
  it('resolves a Toronto address stored under FORMER TORONTO', async () => {
    const result = await geocodeWithOda(aliasEnv(), {
      address: '100 Queen St W',
      city: 'Toronto',
      state: 'ON',
    });
    expect(result.geocodeMethod).toBe('exact');
    expect(result.lat).toBeCloseTo(43.65282, 4);
    expect(result.lon).toBeCloseTo(-79.38363, 4);
  });

  it('resolves a Toronto address stored under a former suburb', async () => {
    const result = await geocodeWithOda(aliasEnv(), {
      address: '757 Victoria Park Ave',
      city: 'Toronto',
      state: 'ON',
    });
    expect(result.geocodeMethod).toBe('exact');
    expect(result.lat).toBeCloseTo(43.692101, 4);
  });

  it('resolves Hamilton, stored as CITY OF HAMILTON', async () => {
    const result = await geocodeWithOda(aliasEnv(), {
      address: '71 Main St E',
      city: 'Hamilton',
      state: 'ON',
    });
    expect(result.geocodeMethod).toBe('exact');
    expect(result.lat).toBeCloseTo(43.25636, 4);
  });

  it('still resolves when the caller names the former municipality directly', async () => {
    const result = await geocodeWithOda(aliasEnv(), {
      address: '757 Victoria Park Ave',
      city: 'Scarborough',
      state: 'ON',
    });
    expect(result.geocodeMethod).toBe('exact');
    expect(result.lat).toBeCloseTo(43.692101, 4);
  });

  it('refuses to guess when an alias matches several municipalities', async () => {
    // 500 Collide St exists in both Scarborough and North York. Silently returning
    // either would be a plausible wrong answer, and possibly the wrong riding.
    await expect(
      geocodeWithOda(aliasEnv(), { address: '500 Collide St', city: 'Toronto', state: 'ON' })
    ).rejects.toMatchObject({ code: 'AMBIGUOUS_LOCATION' });
  });

  it('prefers the caller own spelling over an alias collision', async () => {
    // Naming Scarborough explicitly must win outright rather than be ambiguous.
    const result = await geocodeWithOda(aliasEnv(), {
      address: '500 Collide St',
      city: 'Scarborough',
      state: 'ON',
    });
    expect(result.geocodeMethod).toBe('exact');
    expect(result.lat).toBeCloseTo(43.77, 4);
  });

  it('reports a genuinely absent address as not found, not ambiguous', async () => {
    await expect(
      geocodeWithOda(aliasEnv(), { address: '99999 Nowhere St', city: 'Toronto', state: 'ON' })
    ).rejects.toBeInstanceOf(OdaGeocodeError);
  });
});
