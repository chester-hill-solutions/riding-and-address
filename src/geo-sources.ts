/**
 * The upstream registry for every non-riding geographic level CanCoder can serve.
 *
 * Why this file exists: the municipal and sub-municipal tiers (census subdivisions,
 * metropolitan areas, census divisions, federal polling divisions) are published by three
 * official sources as ArcGIS REST services. Each source has its own field names, its own
 * French-language twin service, its own vintage, and its own licence terms. Recording all
 * of that in one place means the acquisition script, the normalizer and the attribution
 * copy in the docs cannot drift apart.
 *
 * The three sources, and why they are all here:
 *
 *  1. `goc-shared-arcgis` — the Government of Canada's shared ArcGIS host
 *     (`maps-cartes.services.geo.ca`). This is the workhorse. It carries the 2016 census
 *     boundary layers and the federal polling-division layers for 2015, 2019, 2021 and
 *     2025. It is not behind a bot wall.
 *
 *  2. `statcan-2021-census` — Statistics Canada's own 2021 Census cartographic boundary
 *     files (`geo.statcan.gc.ca`). It carries the newer 2021 census tiers, including the
 *     census metropolitan areas that the 2016 layers do not. It *is* behind a bot wall:
 *     sustained use earns a 403, and the service keeps refusing for a while afterwards.
 *     Treat it as the 2021 upgrade path, not the daily one.
 *
 *  3. `elections-canada-archives` — the bulk shapefile archives Elections Canada publishes
 *     for the current election (`www.elections.ca/res/cir/mapsCorner/vector/`). One
 *     download each, no paging, no rate limit. Read with geopandas by
 *     `scripts/acquire-electoral-geo.py`, because a shapefile needs a shapefile reader.
 *
 * Two facts worth keeping in mind when editing:
 *
 *  1. The province numbering is shared. Statistics Canada's `PRUID` and Elections Canada's
 *     `FED_NUM` prefix use the same digits: 24=QC, 35=ON, 46=MB, 47=SK, 48=AB, 59=BC,
 *     10=NL, 11=PE, 12=NS, 13=NB, 60=YT, 61=NT, 62=NU. One map serves both sources.
 *
 *  2. Every vintage names its fields differently. The 2015 polling divisions use
 *     `pd_num`/`fed_num` in lower case, the 2019 ones use `PDNUM`/`FEDNUM` with no
 *     separator, the 2021 and 2025 ones use `PD_NUM`/`FED_NUM`. The field map on each
 *     layer spec is what absorbs that, and it is why a layer spec is per-vintage rather
 *     than per-level.
 */

import type { ArcGisLayerRef } from './arcgis';

/** The geographic level a dataset represents. */
export type GeoLevel =
  | 'census-division'
  | 'census-division-subdivision'
  | 'census-subdivision'
  | 'census-metropolitan'
  | 'forward-sortation-area'
  | 'dissemination-area'
  | 'federal-electoral-district'
  | 'federal-polling-division';

export interface GeoSourceLicence {
  id: string;
  name: string;
  url: string;
  /** Attribution string that must ship with any use of the data. */
  attribution: string;
  /** Whether the licence permits redistribution in a hosted product. */
  redistributable: boolean;
}

/**
 * One layer, in one vintage, in one service.
 *
 * `fields` maps a source attribute to the CanCoder property it becomes. `frenchFields`
 * does the same for the French-language twin service; when present, the two services are
 * joined on `joinKey` to attach the French name.
 */
export interface GeoLayerSpec {
  level: GeoLevel;
  /** The vintage of the data. */
  year: number;
  /** The CanCoder dataset code this layer feeds. */
  datasetCode: string;
  /** MapServer root of the English-language service. */
  serviceUrl: string;
  /** Layer id inside the English service. */
  layerId: number;
  /** MapServer root of the French-language service, when one exists. */
  frenchServiceUrl?: string;
  /** Layer id inside the French service. */
  frenchLayerId?: number;
  /** English-service source attribute -> CanCoder property. */
  fields: Readonly<Record<string, string>>;
  /** French-service source attribute -> CanCoder property. */
  frenchFields?: Readonly<Record<string, string>>;
  /** Property that joins the English and French services. */
  joinKey: string;
  /** Property the display name is taken from, before `ENGLISH_NAME` is derived. */
  nameProperty: string;
  /**
   * Attribution for this layer, when it differs from the source's.
   *
   * The shared Government of Canada host carries both Statistics Canada's census layers
   * and Elections Canada's electoral layers under one host but two rights holders, so
   * the attribution has to travel with the layer, not with the host.
   */
  attribution?: string;
}

export interface GeoSourceSpec {
  id: string;
  name: string;
  licence: GeoSourceLicence;
  layers: readonly GeoLayerSpec[];
}

/** Statistics Canada `PRUID` / Elections Canada `FED_NUM` prefix -> province code. */
export const PROV_NUM_TO_CODE: Readonly<Record<string, string>> = {
  '10': 'NL',
  '11': 'PE',
  '12': 'NS',
  '13': 'NB',
  '24': 'QC',
  '35': 'ON',
  '46': 'MB',
  '47': 'SK',
  '48': 'AB',
  '59': 'BC',
  '60': 'YT',
  '61': 'NT',
  '62': 'NU',
};

const STATCAN_OGL: GeoSourceLicence = {
  id: 'statcan-ogl-canada',
  name: 'Open Government Licence – Canada',
  url: 'https://open.canada.ca/en/open-government-licence-canada',
  attribution: '© Statistics Canada, Census of Population',
  redistributable: true,
};

const GOC = 'https://maps-cartes.services.geo.ca/server_serveur/rest/services';

/**
 * The Government of Canada's shared ArcGIS host.
 *
 * Not behind a bot wall, and it carries both the census boundary layers and the federal
 * polling-division layers for four elections. Every layer here has a French twin, and the
 * French twin uses French field names — including accented ones (`RÉIDU`, `RÉNOM`) — so
 * the field map has to name them exactly.
 */
export const GOC_SHARED_SOURCE: GeoSourceSpec = {
  id: 'goc-shared-arcgis',
  name: 'Government of Canada shared ArcGIS services',
  licence: { ...STATCAN_OGL, attribution: '© Statistics Canada, Census of Population' },
  layers: [
    {
      level: 'census-subdivision',
      year: 2016,
      datasetCode: 'csd',
      serviceUrl: `${GOC}/StatCan/census_subdivisions_2016_en/MapServer`,
      layerId: 0,
      frenchServiceUrl: `${GOC}/StatCan/census_subdivisions_2016_fr/MapServer`,
      frenchLayerId: 0,
      fields: {
        CSDUID: 'CSDUID',
        CSDNAME: 'CSDNAME',
        CSDTYPE: 'CSDTYPE',
        PRUID: 'PRUID',
        CDUID: 'CDUID',
        CDNAME: 'CDNAME',
        CDTYPE: 'CDTYPE',
        CCSUID: 'CCSUID',
        CCSNAME: 'CCSNAME',
        ERUID: 'ERUID',
        ERNAME: 'ERNAME',
        CMAUID: 'CMAUID',
        CMANAME: 'CMANAME',
        CMATYPE: 'CMATYPE',
      },
      frenchFields: {
        SDRIDU: 'CSDUID',
        SDRNOM: 'CSDNAME_FR',
        PRIDU: 'PRUID',
        DRIDU: 'CDUID',
        DRNOM: 'CDNAME_FR',
        SRUIDU: 'CCSUID',
        SRUNOM: 'CCSNAME_FR',
        RMRIDU: 'CMAUID',
        RMRNOM: 'CMANAME_FR',
      },
      joinKey: 'CSDUID',
      nameProperty: 'CSDNAME',
      attribution: '© Statistics Canada, 2016 Census of Population',
    },
    {
      level: 'census-division',
      year: 2016,
      datasetCode: 'cd',
      serviceUrl: `${GOC}/StatCan/census_division_2016_en/MapServer`,
      layerId: 0,
      frenchServiceUrl: `${GOC}/StatCan/census_division_2016_fr/MapServer`,
      frenchLayerId: 0,
      fields: {
        CDUID: 'CDUID',
        CDNAME: 'CDNAME',
        CDTYPE: 'CDTYPE',
        PRUID: 'PRUID',
      },
      frenchFields: {
        DRIDU: 'CDUID',
        DRNOM: 'CDNAME_FR',
        PRIDU: 'PRUID',
      },
      joinKey: 'CDUID',
      nameProperty: 'CDNAME',
      attribution: '© Statistics Canada, 2016 Census of Population',
    },
    {
      level: 'federal-polling-division',
      year: 2025,
      datasetCode: 'pd',
      serviceUrl: `${GOC}/ELECTIONS/FED_Elect2025_en/MapServer`,
      layerId: 1,
      frenchServiceUrl: `${GOC}/ELECTIONS/FED_Elect2025_fr/MapServer`,
      frenchLayerId: 1,
      fields: {
        FED_NUM: 'FED_NUM',
        PD_NUM: 'PD_NUM',
        PD_NBR_SFX: 'PD_NBR_SFX',
        PD_NUM_SFX_CO: 'PD_NUM_SFX_CO',
        PD_TYPE: 'PD_TYPE',
        ADV_POLL_NUM: 'ADV_POLL_NUM',
      },
      joinKey: 'FED_NUM',
      nameProperty: 'PD_NUM_SFX_CO',
      attribution: '© Elections Canada, federal polling division boundaries',
    },
    {
      level: 'federal-electoral-district',
      year: 2025,
      datasetCode: 'fed',
      serviceUrl: `${GOC}/ELECTIONS/FED_Elect2025_en/MapServer`,
      layerId: 3,
      frenchServiceUrl: `${GOC}/ELECTIONS/FED_Elect2025_fr/MapServer`,
      frenchLayerId: 3,
      fields: {
        FED_NUM: 'FED_NUM',
        ED_NAMEE: 'ED_NAMEE',
        ED_NAMEF: 'ED_NAMEF',
        REPORDER: 'REPORDER',
      },
      joinKey: 'FED_NUM',
      nameProperty: 'ED_NAMEE',
      attribution: '© Elections Canada, federal electoral district boundaries',
    },
    {
      level: 'federal-polling-division',
      year: 2021,
      datasetCode: 'pd2021',
      serviceUrl: `${GOC}/ELECTIONS/elections_canada2021_en/MapServer`,
      layerId: 2,
      frenchServiceUrl: `${GOC}/ELECTIONS/elections_canada2021_fr/MapServer`,
      frenchLayerId: 2,
      fields: {
        FED_NUM: 'FED_NUM',
        PD_NUM: 'PD_NUM',
        PD_NBR_SFX: 'PD_NBR_SFX',
        PD_NUM_SFX_CO: 'PD_NUM_SFX_CO',
        PD_TYPE: 'PD_TYPE',
        ADV_POLL_NBR: 'ADV_POLL_NUM',
      },
      joinKey: 'FED_NUM',
      nameProperty: 'PD_NUM_SFX_CO',
      attribution: '© Elections Canada, federal polling division boundaries',
    },
    {
      level: 'federal-polling-division',
      year: 2019,
      datasetCode: 'pd2019',
      serviceUrl: `${GOC}/ELECTIONS/elections_canada_2019_en/MapServer`,
      layerId: 2,
      frenchServiceUrl: `${GOC}/ELECTIONS/elections_canada_2019_fr/MapServer`,
      frenchLayerId: 2,
      fields: {
        FEDNUM: 'FED_NUM',
        PDNUM: 'PD_NUM',
        PDNUMSFX: 'PD_NBR_SFX',
        PDTYPE: 'PD_TYPE',
        ADVPOLLNUM: 'ADV_POLL_NUM',
        POLLNAME: 'POLL_NAME',
      },
      joinKey: 'FED_NUM',
      nameProperty: 'PD_NUM',
      attribution: '© Elections Canada, federal polling division boundaries',
    },
    {
      level: 'federal-polling-division',
      year: 2015,
      datasetCode: 'pd2015',
      serviceUrl: `${GOC}/ELECTIONS/polling_divisions_boundaries_2015_en/MapServer`,
      layerId: 0,
      frenchServiceUrl: `${GOC}/ELECTIONS/polling_divisions_boundaries_2015_fr/MapServer`,
      frenchLayerId: 0,
      fields: {
        fed_num: 'FED_NUM',
        pd_num: 'PD_NUM',
        pd_nbr_sfx: 'PD_NBR_SFX',
        pd_type: 'PD_TYPE',
        adv_poll: 'ADV_POLL_NUM',
        poll_name: 'POLL_NAME',
        urban_rural_ind: 'URBAN_RURAL',
      },
      joinKey: 'FED_NUM',
      nameProperty: 'PD_NUM',
      attribution: '© Elections Canada, federal polling division boundaries',
    },
  ],
};

/**
 * Statistics Canada's 2021 Census cartographic boundary files.
 *
 * The bulk-download host behind this data answers 403 to non-browser clients, so the
 * ArcGIS service is the only route. The service rate-limits hard: sustained paging earns
 * a 403, and it keeps refusing for a while afterwards. Use it for the 2021 census tiers
 * in a patient, resumable run — not for the daily work.
 */
export const STATCAN_2021_CENSUS_SOURCE: GeoSourceSpec = {
  id: 'statcan-2021-census',
  name: 'Statistics Canada — 2021 Census cartographic boundary files',
  licence: { ...STATCAN_OGL, attribution: '© Statistics Canada, 2021 Census of Population' },
  layers: [
    {
      level: 'census-metropolitan',
      year: 2021,
      datasetCode: 'cma',
      serviceUrl:
        'https://geo.statcan.gc.ca/geo_wa/rest/services/2021/Cartographic_boundary_files/MapServer',
      layerId: 6,
      frenchServiceUrl:
        'https://geo.statcan.gc.ca/geo_wa/rest/services/2021/Fichiers_des_limites_cartographiques/MapServer',
      frenchLayerId: 6,
      fields: {
        CMAUID: 'CMAUID',
        DGUID: 'DGUID',
        CMANAME: 'CMANAME',
        CMATYPE: 'CMATYPE',
        PRUID: 'PRUID',
        LANDAREA: 'LANDAREA',
      },
      frenchFields: {
        IDUGD: 'DGUID',
        RMRNOM: 'CMANAME_FR',
        PRIDU: 'PRUID',
      },
      joinKey: 'DGUID',
      nameProperty: 'CMANAME',
    },
    {
      level: 'census-subdivision',
      year: 2021,
      datasetCode: 'csd2021',
      serviceUrl:
        'https://geo.statcan.gc.ca/geo_wa/rest/services/2021/Cartographic_boundary_files/MapServer',
      layerId: 9,
      frenchServiceUrl:
        'https://geo.statcan.gc.ca/geo_wa/rest/services/2021/Fichiers_des_limites_cartographiques/MapServer',
      frenchLayerId: 9,
      fields: {
        CSDUID: 'CSDUID',
        DGUID: 'DGUID',
        CSDNAME: 'CSDNAME',
        CSDTYPE: 'CSDTYPE',
        PRUID: 'PRUID',
        LANDAREA: 'LANDAREA',
      },
      frenchFields: {
        IDUGD: 'DGUID',
        SDRNOM: 'CSDNAME_FR',
        PRIDU: 'PRUID',
      },
      joinKey: 'DGUID',
      nameProperty: 'CSDNAME',
    },
  ],
};

/** Every source CanCoder can pull the new geographic levels from. */
export const GEO_SOURCES: readonly GeoSourceSpec[] = [
  GOC_SHARED_SOURCE,
  STATCAN_2021_CENSUS_SOURCE,
];

/** Looks a source up by id. */
export function getGeoSource(id: string): GeoSourceSpec | undefined {
  return GEO_SOURCES.find((source) => source.id === id);
}

/** Every layer spec across every source. */
export function getAllGeoLayerSpecs(): GeoLayerSpec[] {
  return GEO_SOURCES.flatMap((source) => source.layers);
}

/** The layer spec that feeds a dataset code. */
export function getGeoLayerSpecByCode(code: string): GeoLayerSpec | undefined {
  return getAllGeoLayerSpecs().find((spec) => spec.datasetCode === code);
}

/** The ArcGIS layer reference for a spec, in the given language. */
export function geoLayerRef(spec: GeoLayerSpec, french = false): ArcGisLayerRef | undefined {
  const serviceUrl = french ? spec.frenchServiceUrl : spec.serviceUrl;
  if (!serviceUrl) return undefined;
  return { serviceUrl, layerId: french ? (spec.frenchLayerId ?? spec.layerId) : spec.layerId };
}

/**
 * The province code for a Statistics Canada `PRUID` or an Elections Canada `FED_NUM`.
 *
 * Both numbering schemes share the same province digits, so one lookup covers both.
 * Returns `undefined` for an unmapped or malformed value rather than guessing.
 */
export function provinceCodeFromProvNum(value: unknown): string | undefined {
  if (typeof value !== 'number' && typeof value !== 'string') return undefined;
  const trimmed = String(value).trim();
  if (!trimmed) return undefined;
  // FED_NUM is 5 digits (e.g. 24037 -> 24); PRUID is 2 digits (e.g. 24).
  const prefix = trimmed.length >= 3 ? trimmed.slice(0, 2) : trimmed.padStart(2, '0');
  return PROV_NUM_TO_CODE[prefix];
}
