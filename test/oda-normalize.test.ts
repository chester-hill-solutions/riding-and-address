import { describe, it, expect } from 'vitest';
import {
  buildSearchKey,
  foldAccents,
  normalizeOdaCsvRow,
  normalizeProvince,
  parseAddressQuery,
  parseFreeformAddress,
  buildCityKey,
} from '../src/oda-normalize';
import { haversineMeters } from '../src/oda-geocoding';

describe('oda-normalize', () => {
  it('folds accents for matching', () => {
    expect(foldAccents('Montréal')).toBe('MONTREAL');
  });

  it('maps province names to codes', () => {
    expect(normalizeProvince('Ontario')).toBe('ON');
    expect(normalizeProvince('QC')).toBe('QC');
    expect(normalizeProvince('35')).toBe('ON');
  });

  it('parses civic and street from freeform address', () => {
    const parsed = parseFreeformAddress('123 Main St');
    expect(parsed.civic).toBe('123');
    expect(parsed.streetName).toBe('Main');
    expect(parsed.streetType).toBe('ST');
  });

  it('parses unit-civic dash format (Canadian condos)', () => {
    const parsed = parseFreeformAddress('901-560 Birchmount Rd');
    expect(parsed.unit).toBe('901');
    expect(parsed.civic).toBe('560');
    expect(parsed.streetName).toBe('Birchmount');
    expect(parsed.streetType).toBe('RD');
  });

  it('parses Unit prefix format', () => {
    const parsed = parseFreeformAddress('Unit 1205, 123 Main St');
    expect(parsed.unit).toBe('1205');
    expect(parsed.civic).toBe('123');
    expect(parsed.streetName).toBe('Main');
    expect(parsed.streetType).toBe('ST');
  });

  it('parses inline unit format', () => {
    const parsed = parseFreeformAddress('105 Unit 2 Broadview Ave');
    expect(parsed.unit).toBe('2');
    expect(parsed.civic).toBe('105');
    expect(parsed.streetName).toBe('Broadview');
    expect(parsed.streetType).toBe('AVE');
  });

  it('parses comma unit suffix with hash', () => {
    const parsed = parseFreeformAddress('90 Edgewood Ave, Unit # 132');
    expect(parsed.unit).toBe('132');
    expect(parsed.civic).toBe('90');
    expect(parsed.streetName).toBe('Edgewood');
    expect(parsed.streetType).toBe('AVE');
  });

  it('parses 312 Unit 4 Dundas St E', () => {
    const parsed = parseFreeformAddress('312 Unit 4 Dundas St E');
    expect(parsed.unit).toBe('4');
    expect(parsed.civic).toBe('312');
    expect(parsed.streetDirection).toBe('E');
  });

  it('includes unit in parseAddressQuery', () => {
    const parsed = parseAddressQuery({
      address: '901-560 Birchmount Rd',
      city: 'Toronto',
      state: 'ON',
    });
    expect(parsed.unit).toBe('901');
    expect(parsed.civic).toBe('560');
    expect(parsed.streetName).toBe('BIRCHMOUNT');
  });

  it('builds deterministic search keys', () => {
    const key = buildSearchKey({
      civic: '123',
      streetName: 'MAIN',
      streetType: 'ST',
      city: 'TORONTO',
      province: 'ON',
    });
    expect(key).toBe('123|MAIN|ST||TORONTO|ON');
  });

  it('parses query with city and province', () => {
    const parsed = parseAddressQuery({
      address: '123 Main St',
      city: 'Toronto',
      state: 'ON',
    });
    expect(parsed.civic).toBe('123');
    expect(parsed.province).toBe('ON');
    expect(parsed.city).toBe('TORONTO');
  });

  it('builds city keys with province', () => {
    expect(buildCityKey('Toronto', 'ON')).toBe('TORONTO|ON');
  });

  it('normalizes StatCan ODA CSV rows', () => {
    const row = normalizeOdaCsvRow({
      latitude: '43.88570',
      longitude: '-79.01632',
      street_no: '56',
      str_name_pcs: 'RUMBELLOW',
      str_type_pcs: 'CRESCENT',
      city_pcs: 'AJAX',
      pruid: '35',
      full_addr: '56 RUMBELLOW CRESCENT',
    });
    expect(row).not.toBeNull();
    expect(row?.province).toBe('ON');
    expect(row?.civicNumber).toBe('56');
    expect(row?.streetName).toBe('RUMBELLOW');
    expect(row?.streetType).toBe('CRESCENT');
    expect(row?.city).toBe('AJAX');
  });
});

describe('haversineMeters', () => {
  it('returns zero for identical points', () => {
    expect(haversineMeters(-79.38, 43.65, -79.38, 43.65)).toBe(0);
  });

  it('returns positive distance for nearby points', () => {
    const distance = haversineMeters(-79.3832, 43.6532, -79.3833, 43.6533);
    expect(distance).toBeGreaterThan(0);
    expect(distance).toBeLessThan(100);
  });
});
