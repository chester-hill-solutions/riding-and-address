import { describe, it, expect } from 'vitest';
import {
  displayNameFor,
  geoLevelLabel,
  mergeFrenchProperties,
  normalizeGeoCollection,
  normalizeGeoProperties,
} from '../src/geo-normalize';
import { GOC_SHARED_SOURCE } from '../src/geo-sources';
import type { GeoJSONFeature } from '../src/types';

const CSD = GOC_SHARED_SOURCE.layers.find((l) => l.datasetCode === 'csd')!;
const CD = GOC_SHARED_SOURCE.layers.find((l) => l.datasetCode === 'cd')!;
const PD = GOC_SHARED_SOURCE.layers.find((l) => l.datasetCode === 'pd')!;

function feature(properties: Record<string, unknown>): GeoJSONFeature {
  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
    properties,
  };
}

describe('normalizeGeoProperties', () => {
  it('maps the source attributes onto the CanCoder property contract', () => {
    const properties = normalizeGeoProperties(
      {
        CSDUID: '3520005',
        CSDNAME: 'Brampton',
        CSDTYPE: 'CY',
        PRUID: '35',
        CDUID: '3520',
        CDNAME: 'Peel',
        CMAUID: '125',
        CMANAME: 'Toronto',
      },
      {
        level: 'census-subdivision',
        fields: CSD.fields,
        nameProperty: CSD.nameProperty,
      }
    );

    expect(properties.CSDUID).toBe('3520005');
    expect(properties.CSDNAME).toBe('Brampton');
    expect(properties.CSDTYPE).toBe('CY');
    expect(properties.CDUID).toBe('3520');
    expect(properties.CMANAME).toBe('Toronto');
  });

  it('derives PROV_TERR from the PRUID', () => {
    const properties = normalizeGeoProperties(
      { CSDUID: '1', CSDNAME: 'Division No. 1', PRUID: '10' },
      { level: 'census-subdivision', fields: CSD.fields, nameProperty: CSD.nameProperty }
    );
    expect(properties.PROV_TERR).toBe('NL');
  });

  it('derives PROV_TERR from the FED_NUM for electoral layers', () => {
    const properties = normalizeGeoProperties(
      { FED_NUM: 24037, PD_NUM: 83 },
      { level: 'federal-polling-division', fields: PD.fields, nameProperty: PD.nameProperty }
    );
    expect(properties.PROV_TERR).toBe('QC');
  });

  it('sets ENGLISH_NAME from the level name property', () => {
    const properties = normalizeGeoProperties(
      { CDUID: '1001', CDNAME: 'Division No. 1', CDTYPE: 'CDR', PRUID: '10' },
      { level: 'census-division', fields: CD.fields, nameProperty: CD.nameProperty }
    );
    expect(properties.ENGLISH_NAME).toBe('Division No. 1');
  });

  it('leaves PROV_TERR unset for an unmapped province number', () => {
    const properties = normalizeGeoProperties(
      { CSDUID: '1', CSDNAME: 'Nowhere', PRUID: '99' },
      { level: 'census-subdivision', fields: CSD.fields, nameProperty: CSD.nameProperty }
    );
    expect(properties.PROV_TERR).toBeUndefined();
  });

  it('drops null and undefined source values', () => {
    const properties = normalizeGeoProperties(
      { CSDUID: '1', CSDNAME: 'X', LANDAREA: null },
      { level: 'census-subdivision', fields: CSD.fields, nameProperty: CSD.nameProperty }
    );
    expect('LANDAREA' in properties).toBe(false);
  });
});

describe('displayNameFor', () => {
  it('qualifies a polling division with its riding', () => {
    const name = displayNameFor(
      { ED_NAMEE: 'Ajax', PD_NUM_SFX_CO: '20-083' },
      { level: 'federal-polling-division', fields: PD.fields, nameProperty: PD.nameProperty }
    );
    expect(name).toBe('Ajax — PD 20-083');
  });

  it('falls back to the division number when the riding is unknown', () => {
    const name = displayNameFor(
      { PD_NUM_SFX_CO: '20-083' },
      { level: 'federal-polling-division', fields: PD.fields, nameProperty: PD.nameProperty }
    );
    expect(name).toBe('PD 20-083');
  });

  it('uses the plain name for a census subdivision', () => {
    const name = displayNameFor(
      { CSDNAME: 'Brampton' },
      { level: 'census-subdivision', fields: CSD.fields, nameProperty: CSD.nameProperty }
    );
    expect(name).toBe('Brampton');
  });
});

describe('mergeFrenchProperties', () => {
  const CSD_FR = CSD.frenchFields!;

  it('attaches the French name to the matching English feature', () => {
    const english = [feature({ CSDUID: '3520005', CSDNAME: 'Brampton' })];
    const french = [feature({ SDRIDU: '3520005', SDRNOM: 'Brampton (fr)' })];

    const merged = mergeFrenchProperties(english, french, CSD_FR, CSD.joinKey);

    expect(merged[0].properties.CSDNAME_FR).toBe('Brampton (fr)');
    expect(merged[0].properties.CSDNAME).toBe('Brampton');
  });

  it('leaves a feature with no French match untouched', () => {
    const english = [feature({ CSDUID: 'missing', CSDNAME: 'Brampton' })];
    const merged = mergeFrenchProperties(english, [feature({ SDRIDU: 'other', SDRNOM: 'x' })], CSD_FR, CSD.joinKey);
    expect(merged[0].properties.CSDNAME_FR).toBeUndefined();
  });

  it('never overwrites an English value that is already present', () => {
    const english = [feature({ CSDUID: 'X', CSDNAME_FR: 'keep me' })];
    const french = [feature({ SDRIDU: 'X', SDRNOM: 'replace me' })];

    const merged = mergeFrenchProperties(english, french, CSD_FR, CSD.joinKey);

    expect(merged[0].properties.CSDNAME_FR).toBe('keep me');
  });

  it('skips a French feature whose join key is missing', () => {
    const english = [feature({ CSDUID: 'X', CSDNAME: 'Brampton' })];
    const merged = mergeFrenchProperties(english, [feature({ SDRNOM: 'orphan' })], CSD_FR, CSD.joinKey);
    expect(merged[0].properties.CSDNAME_FR).toBeUndefined();
  });

  it('keeps the first French feature when the join key repeats', () => {
    const english = [feature({ CSDUID: 'X', CSDNAME: 'Brampton' })];
    const french = [
      feature({ SDRIDU: 'X', SDRNOM: 'first' }),
      feature({ SDRIDU: 'X', SDRNOM: 'second' }),
    ];
    const merged = mergeFrenchProperties(english, french, CSD_FR, CSD.joinKey);
    expect(merged[0].properties.CSDNAME_FR).toBe('first');
  });
});

describe('normalizeGeoCollection', () => {
  it('normalizes every feature in the collection', () => {
    const collection = normalizeGeoCollection(
      [
        feature({ CSDUID: '1', CSDNAME: 'Ajax', PRUID: '35' }),
        feature({ CSDUID: '2', CSDNAME: 'Toronto', PRUID: '35' }),
      ],
      { level: 'census-subdivision', fields: CSD.fields, nameProperty: CSD.nameProperty }
    );

    expect(collection.map((f) => f.properties.ENGLISH_NAME)).toEqual(['Ajax', 'Toronto']);
    expect(collection.every((f) => f.properties.PROV_TERR === 'ON')).toBe(true);
  });
});

describe('geoLevelLabel', () => {
  it('labels every level', () => {
    expect(geoLevelLabel('census-subdivision')).toBe('Census Subdivision');
    expect(geoLevelLabel('census-metropolitan')).toBe('Census Metropolitan Area');
    expect(geoLevelLabel('federal-polling-division')).toBe('Federal Polling Division');
  });
});
