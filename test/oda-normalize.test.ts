import { describe, it, expect } from 'vitest';
import {
  DEFAULT_STREET_TYPES,
  buildSearchKey,
  buildStreetKey,
  foldAccents,
  formatStreetLabel,
  leadingCivicNumber,
  normalizeOdaCsvRow,
  normalizeProvince,
  normalizeSearchToken,
  normalizeStreetDirection,
  normalizeStreetType,
  parseAddressQuery,
  parseCivicNumber,
  parseFreeformAddress,
  parseStreetKey,
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

  it('parses a pasted address with a comma after the civic and an embedded postal code', () => {
    // Real failing input: 2 Welby Cir, East York, ON M4B 2Y8 (data stores the type as CIR).
    const parsed = parseAddressQuery({ address: '2, WELBY CRCL, M4B 2Y8' });
    expect(parsed.civic).toBe('2');
    expect(parsed.streetName).toBe('WELBY');
    expect(parsed.streetType).toBe('CIR');
    expect(parsed.postal).toBe('M4B 2Y8');
  });

  it('extracts an embedded city and province from a pasted address', () => {
    const parsed = parseAddressQuery({ address: '123 Main St, Toronto, ON M5V 2T6' });
    expect(parsed.civic).toBe('123');
    expect(parsed.city).toBe('TORONTO');
    expect(parsed.province).toBe('ON');
    expect(parsed.postal).toBe('M5V 2T6');
  });

  it('does not treat a city-only string as a street', () => {
    const parsed = parseAddressQuery({ address: 'Vancouver, BC' });
    expect(parsed.city).toBe('VANCOUVER');
    expect(parsed.province).toBe('BC');
    expect(parsed.streetName).toBeUndefined();
  });

  it('keeps unit suffixes intact when a postal code follows', () => {
    const parsed = parseAddressQuery({ address: '90 Edgewood Ave, Unit # 132, M5V 2T6' });
    expect(parsed.unit).toBe('132');
    expect(parsed.streetName).toBe('EDGEWOOD');
    expect(parsed.postal).toBe('M5V 2T6');
  });

  it('canonicalises Circle aliases to the stored CIR form', () => {
    for (const type of ['CRCL', 'CIRCL', 'CIRCLE', 'CIR']) {
      expect(normalizeStreetType(type)).toBe('CIR');
    }
    const parsed = parseAddressQuery({ address: '2 WELBY CRCL' });
    expect(parsed.streetType).toBe('CIR');
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

describe('parseStreetKey', () => {
  it('splits name, type and direction', () => {
    expect(parseStreetKey('MAIN|ST|N')).toEqual({
      streetName: 'MAIN',
      streetType: 'ST',
      streetDirection: 'N',
    });
  });

  it('splits name and type', () => {
    expect(parseStreetKey('MAIN|ST')).toEqual({
      streetName: 'MAIN',
      streetType: 'ST',
      streetDirection: '',
    });
  });

  it('resolves the ambiguous two-part case by value, not position', () => {
    // `MAIN|N` and `MAIN|ST` are both two parts; only the value sets can tell them apart.
    expect(parseStreetKey('MAIN|N')).toEqual({
      streetName: 'MAIN',
      streetType: '',
      streetDirection: 'N',
    });
  });

  it('treats a lone part as a name, even when it looks like a type', () => {
    expect(parseStreetKey('ST')).toEqual({ streetName: 'ST', streetType: '', streetDirection: '' });
  });

  it('handles a multi-word street name', () => {
    expect(parseStreetKey('OLD KINGSTON|RD|E')).toEqual({
      streetName: 'OLD KINGSTON',
      streetType: 'RD',
      streetDirection: 'E',
    });
  });

  it('returns empty parts for an empty key', () => {
    expect(parseStreetKey('')).toEqual({ streetName: '', streetType: '', streetDirection: '' });
  });

  it('round-trips buildStreetKey for canonical inputs', () => {
    const cases: Array<[string, string, string]> = [
      ['MAIN', 'ST', 'N'],
      ['MAIN', 'STREET', ''],
      ['QUEEN', 'AVENUE', 'WEST'],
      ['STE-CATHERINE', 'RUE', ''],
      ['BAY', '', ''],
    ];

    for (const [name, type, dir] of cases) {
      const key = buildStreetKey(name, type, dir);
      const parsed = parseStreetKey(key);
      expect(parsed.streetName).toBe(normalizeSearchToken(name));
      expect(parsed.streetType).toBe(normalizeStreetType(type));
      expect(parsed.streetDirection).toBe(normalizeStreetDirection(dir));
    }
  });
});

describe('formatStreetLabel', () => {
  it('title-cases the street for display', () => {
    expect(formatStreetLabel('MAIN|ST|N')).toBe('Main St N');
  });

  it('keeps hyphenated names capitalised on both sides', () => {
    expect(formatStreetLabel('STE-CATHERINE|RUE')).toBe('Ste-Catherine Rue');
  });
});

describe('civic-number grammar', () => {
  it('parses the same civic forms the free-form parser extracts', () => {
    for (const raw of ['123', '123A', '123 1/2']) {
      const parsed = parseCivicNumber(raw);
      expect(parsed?.numeric).not.toBeNull();
      const freeform = parseFreeformAddress(`${raw} Main St`);
      expect(freeform.civic).toBe(raw);
      expect(parseCivicNumber(freeform.civic)?.numeric).toBe(parsed?.numeric);
    }
  });

  it('rejects a string that is not a whole civic number', () => {
    expect(parseCivicNumber('Main St')?.numeric).toBeNull();
    expect(parseCivicNumber('')).toBeUndefined();
  });
});

describe('leadingCivicNumber', () => {
  it('reads the same leading digits the grammar defines', () => {
    expect(leadingCivicNumber('  123A Main St')).toBe('123');
    expect(leadingCivicNumber('757 Victoria Park')).toBe('757');
    expect(leadingCivicNumber('Main St')).toBeUndefined();
    expect(leadingCivicNumber(undefined)).toBeUndefined();
  });
});

describe('DEFAULT_STREET_TYPES', () => {
  it('contains only canonical street-type values', () => {
    for (const type of DEFAULT_STREET_TYPES) {
      if (!type) continue;
      expect(normalizeStreetType(type)).toBe(type);
    }
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
