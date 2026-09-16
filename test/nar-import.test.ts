import { describe, it, expect } from 'vitest';
import {
  NAR_DELETE_CHUNK_ROWS,
  buildNarAddressDeleteChunkSql,
  buildNarCityCentroidDeleteSql,
  buildNarPostalRecomputeSql,
  buildNarProvenanceSql,
  buildNarStreetRangeDeleteChunkSql,
  getNarSchemaSql,
  parseNarCityQueue,
  pickNextNarCity,
  provinceNumericCode,
  selectNarEntries,
} from '../src/nar-import';
import { buildNarCityScope } from '../src/nar-normalize';
import { buildSuggestPopulateCitiesSql } from '../src/oda-schema';

const archiveEntries = [
  'RNAguide.pdf',
  'NARguide.pdf',
  'Locations/',
  'Locations/Location_24_part_1.csv',
  'Locations/Location_35_part_1.csv',
  'Locations/Location_35_part_2.csv',
  'Addresses/',
  'Addresses/Address_24_part_1.csv',
  'Addresses/Address_35_part_1.csv',
  'Addresses/Address_35_part_2.csv',
  'Addresses/Address_10.csv',
];

describe('nar-import', () => {
  it('maps a province code to its StatCan numeric code', () => {
    expect(provinceNumericCode('ON')).toBe('35');
    expect(provinceNumericCode('QC')).toBe('24');
    expect(provinceNumericCode('XX')).toBeUndefined();
  });

  it('selects every split part for the requested province only', () => {
    expect(selectNarEntries(archiveEntries, 'Addresses', 'ON')).toEqual([
      'Addresses/Address_35_part_1.csv',
      'Addresses/Address_35_part_2.csv',
    ]);
    expect(selectNarEntries(archiveEntries, 'Locations', 'ON')).toEqual([
      'Locations/Location_35_part_1.csv',
      'Locations/Location_35_part_2.csv',
    ]);
  });

  it('throws when the province is absent rather than loading another one', () => {
    expect(() => selectNarEntries(archiveEntries, 'Addresses', 'PE')).toThrow(/No Addresses CSV/);
  });

  it('creates the provenance table with a per-vintage primary key', () => {
    const sql = getNarSchemaSql().join('\n');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS nar_city_imports');
    expect(sql).toContain('PRIMARY KEY (province, city_key, nar_version)');
  });

  it('deletes only the scoped city rows that predate the run, in bounded chunks', () => {
    const scope = buildNarCityScope('Toronto', 'ON');
    const sql = buildNarAddressDeleteChunkSql('ON', scope, 1_000_000);
    expect(sql).toContain("province = 'ON'");
    expect(sql).toContain("'TORONTO|ON'");
    expect(sql).toContain("'SCARBOROUGH|ON'");
    expect(sql).toContain('id <= 1000000');
    // A single 527k-row delete exceeded D1's CPU budget; every statement must be row-bounded.
    expect(sql).toContain(`LIMIT ${NAR_DELETE_CHUNK_ROWS}`);
    expect(sql).toContain('ORDER BY id');
  });

  it('scopes centroid and street-range deletes to the city keys', () => {
    const scope = buildNarCityScope('Toronto', 'ON');
    expect(buildNarCityCentroidDeleteSql('ON', scope)).toContain('oda_city_centroids');
    expect(buildNarStreetRangeDeleteChunkSql('ON', scope)).toContain('oda_street_ranges');
    expect(buildNarStreetRangeDeleteChunkSql('ON', scope)).toContain("'NORTH YORK|ON'");
    expect(buildNarStreetRangeDeleteChunkSql('ON', scope)).toContain(`LIMIT ${NAR_DELETE_CHUNK_ROWS}`);
  });

  it('recomputes touched postal centroids from the whole table', () => {
    expect(buildNarPostalRecomputeSql('ON', [])).toEqual([]);
    const statements = buildNarPostalRecomputeSql('ON', ['M5V2T6', 'M5G2K6']);
    expect(statements).toHaveLength(2);
    expect(statements[0]).toContain('DELETE FROM oda_postal_centroids');
    // Re-aggregating from oda_addresses (not from the city slice) is what keeps a postal code
    // that straddles a city line correct.
    expect(statements[1]).toContain('FROM oda_addresses');
    expect(statements[1]).toContain('GROUP BY province, postal_code');
  });

  it('upserts provenance so a re-run of the same vintage is idempotent', () => {
    const sql = buildNarProvenanceSql({
      province: 'ON',
      scope: buildNarCityScope('Toronto', 'ON'),
      city: 'Toronto',
      version: '202606',
      sourceUrl: 'https://example.test/202606.zip',
      rowCount: 42,
    });
    expect(sql).toContain('INSERT INTO nar_city_imports');
    expect(sql).toContain('ON CONFLICT(province, city_key, nar_version) DO UPDATE');
    expect(sql).toContain("'TORONTO|ON'");
  });

  it('parses the queue file, ignoring comments and duplicates', () => {
    const parsed = parseNarCityQueue('# header\n\nON\tToronto\nQC\tMontreal\nON\tToronto\nON\t  Ottawa  \n');
    expect(parsed).toEqual([
      { province: 'ON', city: 'Toronto' },
      { province: 'QC', city: 'Montreal' },
      { province: 'ON', city: 'Ottawa' },
    ]);
  });

  it('picks the first queue entry not yet refreshed', () => {
    const parsed = parseNarCityQueue('ON\tToronto\nQC\tMontreal\nAB\tCalgary\n');
    expect(pickNextNarCity(parsed, new Set(['ON|TORONTO']))).toEqual({ province: 'QC', city: 'Montreal' });
    expect(pickNextNarCity(parsed, new Set())).toEqual({ province: 'ON', city: 'Toronto' });
    expect(
      pickNextNarCity(parsed, new Set(['ON|TORONTO', 'QC|MONTREAL', 'AB|CALGARY']))
    ).toBeUndefined();
  });

  it('rebuilds only the refreshed city slice of the suggest index', () => {
    const statements = buildSuggestPopulateCitiesSql('ON', ['TORONTO|ON', 'SCARBOROUGH|ON']);
    expect(statements).toHaveLength(4);
    expect(statements[0].params).toEqual(['ON', 'TORONTO|ON', 'SCARBOROUGH|ON']);
    expect(statements[0].sql).toContain('oda_suggest_fts');
    expect(statements[2].sql).toContain('city_key IN (?, ?)');
    expect(statements[3].sql).toContain('INSERT INTO oda_suggest_fts');
  });
});
