import { Env, Suggestion, SuggestQueryParams, OdaAddressComponents } from './types';
import {
  ODA_SUGGEST_DEFAULTS,
  SUGGEST_WEIGHTS,
  getOdaConfig,
  getOdaSuggestConfig,
} from './oda-config';
import {
  formatStreetLabel,
  normalizeSearchToken,
  normalizeStreetDirection,
  normalizeStreetType,
  normalizeUnit,
  parseFreeformAddress,
  parseStreetKey,
} from './oda-normalize';
import { haversineMeters } from './oda-geocoding';

/**
 * Address autocomplete over the ODA tables.
 *
 * Deliberately D1-only: this module imports nothing from R2, spatial, or the lookup path, so
 * typing never loads GeoJSON or runs point-in-polygon. Riding is resolved by the caller from a
 * suggestion's `location` via the existing lookup routes, only once the user selects one.
 */

export class SuggestError extends Error {
  code: string;
  status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = 'SuggestError';
    this.code = code;
    this.status = status;
  }
}

interface SuggestRow {
  id: number;
  province: string;
  city: string;
  city_key: string;
  street_key: string;
  min_civic: number | null;
  max_civic: number | null;
  lat: number;
  lon: number;
  address_count: number;
  rank: number;
}

interface AddressRow {
  civic_number: string;
  unit: string | null;
  postal_code: string | null;
  street_name: string | null;
  street_type: string | null;
  street_direction: string | null;
  city: string | null;
  province: string;
  lat: number;
  lon: number;
  full_address: string | null;
}

export interface SuggestResult {
  suggestions: Suggestion[];
  provinces: string[];
  nextCursor?: string;
}

// ---------------------------------------------------------------------------
// Container ids
// ---------------------------------------------------------------------------

// Composite of (province, city_key, street_key) rather than the table's rowid, so an id stays
// valid across a suggest rebuild. Tab-separated: normalizeSearchToken collapses all whitespace
// to single spaces, so a tab can never appear inside a part.
//
// A trailing civic scopes the container to one building, whose contents are its units.
const ID_SEP = '\t';

export interface ContainerRef {
  province: string;
  cityKey: string;
  streetKey: string;
  /** Present for a building container; absent for a street container. */
  civic?: string;
}

export function encodeContainerId(
  province: string,
  cityKey: string,
  streetKey: string,
  civic?: string
): string {
  const parts = [province, cityKey, streetKey];
  if (civic) parts.push(civic);
  return toBase64Url(parts.join(ID_SEP));
}

export function decodeContainerId(id: string): ContainerRef | null {
  try {
    const parts = fromBase64Url(id).split(ID_SEP);
    if (parts.length < 3 || parts.length > 4 || !parts[0]) return null;
    return {
      province: parts[0],
      cityKey: parts[1],
      streetKey: parts[2],
      civic: parts[3] || undefined,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Keyset cursors
// ---------------------------------------------------------------------------

/**
 * Keyset rather than OFFSET: paging deep into a street with thousands of civics stays a single
 * index seek, and rows cannot be skipped or repeated if the table shifts between pages.
 */
export interface Cursor {
  /** Street containers: last (civic as integer, civic as written). */
  civicNum?: number;
  civicStr?: string;
  /** Building containers: last unit. */
  unit?: string;
}

export function encodeCursor(cursor: Cursor): string {
  return toBase64Url(JSON.stringify(cursor));
}

export function decodeCursor(value: string): Cursor | null {
  try {
    const parsed = JSON.parse(fromBase64Url(value));
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as Cursor;
  } catch {
    return null;
  }
}

function toBase64Url(value: string): string {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  return atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
}

// ---------------------------------------------------------------------------
// FTS match string
// ---------------------------------------------------------------------------

/**
 * Build an FTS5 MATCH expression from free text.
 *
 * Every token is double-quoted before the `*` — this both neutralises FTS operators that survive
 * normalizeSearchToken (`-` is a MATCH operator, and `AND`/`OR`/`NOT`/`NEAR` are bare keywords)
 * and makes the expression injection-proof.
 *
 * Tokens that have a canonical street form are emitted as an OR group rather than replaced.
 * Replacing would corrupt street *names*: normalizeStreetDirection('WEST') is 'W', so a search
 * for "West St" would become "W St" and miss. `("WEST"* OR "W"*)` matches both the name and the
 * direction, and lets scoring sort out the noise.
 */
export function buildFtsMatchQuery(query: string): string {
  const normalized = normalizeSearchToken(query);
  const groups: string[] = [];

  for (const token of normalized.split(' ')) {
    if (!token) continue;
    const alts = expandToken(token);
    const terms = alts.map((alt) => `${quoteFtsTerm(alt)}*`);
    groups.push(terms.length === 1 ? terms[0] : `(${terms.join(' OR ')})`);
  }

  return groups.join(' AND ');
}

function expandToken(token: string): string[] {
  const alts = new Set<string>([token]);
  const asType = normalizeStreetType(token);
  if (asType && asType !== token) alts.add(asType);
  const asDir = normalizeStreetDirection(token);
  if (asDir && asDir !== token) alts.add(asDir);
  return [...alts];
}

/** FTS5 string literals are double-quoted; an embedded quote is escaped by doubling it. */
function quoteFtsTerm(term: string): string {
  return `"${term.replace(/"/g, '""')}"`;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export interface ScoreInputs {
  suggestText: string;
  normalizedQuery: string;
  /** Raw bm25 (negative; more negative is better). */
  bm25: number;
  bm25Best: number;
  bm25Worst: number;
  addressCount: number;
  maxAddressCount: number;
  distanceMeters?: number;
  civicInRange?: boolean;
}

export function scoreSuggestion(input: ScoreInputs): number {
  const {
    suggestText,
    normalizedQuery,
    bm25,
    bm25Best,
    bm25Worst,
    addressCount,
    maxAddressCount,
    distanceMeters,
    civicInRange,
  } = input;

  const prefixQuality = computePrefixQuality(suggestText, normalizedQuery);

  // bm25 is negative and unbounded; normalise within the candidate window. Degenerate windows
  // (one row, or every row scoring alike) collapse to 1 rather than dividing by zero.
  const span = bm25Worst - bm25Best;
  const bm25Norm = span > 0 ? (bm25Worst - bm25) / span : 1;

  const popularity =
    maxAddressCount > 0 ? Math.log1p(Math.max(0, addressCount)) / Math.log1p(maxAddressCount) : 0;

  const proximity = distanceMeters === undefined ? 0 : 1 / (1 + distanceMeters / 5000);

  return (
    SUGGEST_WEIGHTS.prefixQuality * prefixQuality +
    SUGGEST_WEIGHTS.bm25 * bm25Norm +
    SUGGEST_WEIGHTS.popularity * popularity +
    SUGGEST_WEIGHTS.proximity * proximity +
    SUGGEST_WEIGHTS.civicInRange * (civicInRange ? 1 : 0)
  );
}

function computePrefixQuality(suggestText: string, normalizedQuery: string): number {
  if (!normalizedQuery) return 0.3;
  if (suggestText.startsWith(normalizedQuery)) return 1;

  // Every query token prefixes a suggest token, in order.
  const queryTokens = normalizedQuery.split(' ').filter(Boolean);
  const suggestTokens = suggestText.split(' ').filter(Boolean);
  let cursor = 0;
  for (const qt of queryTokens) {
    let found = false;
    while (cursor < suggestTokens.length) {
      if (suggestTokens[cursor++].startsWith(qt)) {
        found = true;
        break;
      }
    }
    if (!found) return 0.3;
  }
  return 0.6;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export async function searchSuggestions(env: Env, params: SuggestQueryParams): Promise<SuggestResult> {
  const suggestConfig = getOdaSuggestConfig(env);
  const provinces = params.provinces.length ? params.provinces : getOdaConfig(env).provinces;

  if (!env.ODA_DB) {
    throw new SuggestError('ODA database is not configured', 'ODA_NOT_ENABLED', 503);
  }
  if (params.locationBias && params.locationRestriction) {
    throw new SuggestError(
      'Specify locationBias or locationRestriction, not both',
      'INVALID_QUERY',
      400
    );
  }

  // Short queries short-circuit before touching D1 at all — one keystroke is normal typing,
  // not an error, and a cacheable empty result is the cheapest possible response.
  const normalizedQuery = normalizeSearchToken(params.q);
  if (normalizedQuery.length < suggestConfig.minQueryLength) {
    return { suggestions: [], provinces };
  }

  const parsed = parseFreeformAddress(params.q);
  const civic = parsed.civic ? parseInt(parsed.civic, 10) : null;
  const hasCivic = civic !== null && Number.isFinite(civic);
  const unit = parsed.unit ? normalizeUnit(parsed.unit) : '';

  if (params.containerId) {
    return drillIntoContainer(env, params, suggestConfig.limit, hasCivic ? civic : null, unit);
  }

  // suggest_text holds no civic number, so the civic has to come out of the match expression or
  // nothing matches at all. Scoring uses the same stripped text for the same reason.
  const searchText = hasCivic ? stripLeadingCivic(normalizedQuery) : normalizedQuery;

  const rows = await queryContainers(env, params, searchText, provinces, suggestConfig.candidateWindow);
  if (rows.length === 0) return { suggestions: [], provinces };

  const scored = scoreRows(rows, searchText, params, hasCivic ? civic : null);
  const top = scored.slice(0, suggestConfig.limit);

  const suggestions = hasCivic
    ? await resolveLeaves(env, top, civic!, unit, params)
    : top.map(({ row, score, distanceMeters }) =>
        toContainerSuggestion(row, score, searchText, params, distanceMeters)
      );

  return { suggestions, provinces };
}

/**
 * Drop the civic token so the remainder can match suggest_text.
 *
 * Exactly one token: "250 16TH AVE" must keep 16TH, and "901-560 BIRCHMOUNT RD" (the Canadian
 * unit-civic dash form parseFreeformAddress already understands) collapses to BIRCHMOUNT RD.
 */
function stripLeadingCivic(normalized: string): string {
  const tokens = normalized.split(' ');
  if (tokens.length > 1 && /\d/.test(tokens[0])) tokens.shift();
  return tokens.join(' ');
}

async function queryContainers(
  env: Env,
  params: SuggestQueryParams,
  searchText: string,
  provinces: string[],
  window: number
): Promise<SuggestRow[]> {
  const match = buildFtsMatchQuery(searchText);
  if (!match) return [];

  const where: string[] = ['oda_suggest_fts MATCH ?'];
  const binds: unknown[] = [match];

  if (provinces.length) {
    where.push(`s.province IN (${provinces.map(() => '?').join(', ')})`);
    binds.push(...provinces);
  }

  const restriction = params.locationRestriction;
  if (restriction) {
    where.push('s.lat BETWEEN ? AND ?', 's.lon BETWEEN ? AND ?');
    binds.push(restriction.minLat, restriction.maxLat, restriction.minLon, restriction.maxLon);
  }

  /*
   * The window is a truncation, so it must be ordered by something that AGREES with the final
   * score in scoreSuggestion() -- otherwise it throws away the rows scoring would have chosen and
   * everything after it is decoration.
   *
   * It used to be `ORDER BY rank ASC` (bm25 alone), which was wrong twice over:
   *
   *  1. Proximity is applied in JS, after this query. bm25 decided what proximity was allowed to
   *     see, so locationBias could not surface a nearby street that bm25 had already cut.
   *  2. bm25 is a document ranker and misreads short address strings. `"ST"*` prefix-matches
   *     STRATFORD, inflating term frequency, so "MAIN ST STRATFORD ON" outranked
   *     "MAIN ST TORONTO ON" for the query "main st". Its length normalisation also penalises
   *     streets whose city name happens to have more words.
   *
   * So order by the same signals JS weights, strongest first: prefix quality (0.40), then
   * proximity (0.10) when biased, then popularity (0.20). bm25 ranks last, as a tie-breaker only.
   */
  const orderBy: string[] = [];

  // prefixQuality proxy. normalizeSearchToken strips % and _, so the pattern needs no escaping.
  orderBy.push('CASE WHEN s.suggest_text LIKE ? THEN 0 ELSE 1 END ASC');
  binds.push(`${searchText}%`);

  if (params.locationBias) {
    // Planar squared distance, not haversine: no trig, and monotonic enough to ORDER BY. The
    // 0.53 factor is cos(43°)^2 -- a longitude degree is shorter than a latitude degree at
    // Canadian latitudes. Exact distance is recomputed properly in JS for the response.
    orderBy.push('((s.lat - ?) * (s.lat - ?) + (s.lon - ?) * (s.lon - ?) * 0.53) ASC');
    binds.push(params.locationBias.lat, params.locationBias.lat, params.locationBias.lon, params.locationBias.lon);
  }

  orderBy.push('s.address_count DESC', 'rank ASC');
  binds.push(window);

  const sql = `SELECT s.id, s.province, s.city, s.city_key, s.street_key,
                      s.min_civic, s.max_civic, s.lat, s.lon, s.address_count,
                      bm25(oda_suggest_fts) AS rank
               FROM oda_suggest_fts f
               JOIN oda_street_suggest s ON s.id = f.rowid
               WHERE ${where.join(' AND ')}
               ORDER BY ${orderBy.join(', ')}
               LIMIT ?`;

  try {
    const result = await env.ODA_DB!.prepare(sql).bind(...binds).all<SuggestRow>();
    return result.results || [];
  } catch (error) {
    // The suggest tables are built by a separate migration; until it runs, this table is absent.
    if (isMissingSuggestTable(error)) {
      throw new SuggestError(
        'Address suggestions are not available: the suggest index has not been built',
        'SUGGEST_INDEX_MISSING',
        503
      );
    }
    throw error;
  }
}

function isMissingSuggestTable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /no such table/i.test(message) && /oda_(suggest_fts|street_suggest)/.test(message);
}

function scoreRows(
  rows: SuggestRow[],
  normalizedQuery: string,
  params: SuggestQueryParams,
  civic: number | null
): Array<{ row: SuggestRow; score: number; distanceMeters?: number }> {
  const ranks = rows.map((r) => r.rank);
  const bm25Best = Math.min(...ranks);
  const bm25Worst = Math.max(...ranks);
  const maxAddressCount = Math.max(...rows.map((r) => r.address_count), 0);

  const scored = rows.map((row) => {
    const distanceMeters = params.locationBias
      ? haversineMeters(params.locationBias.lon, params.locationBias.lat, row.lon, row.lat)
      : undefined;

    const score = scoreSuggestion({
      suggestText: suggestTextOf(row),
      normalizedQuery,
      bm25: row.rank,
      bm25Best,
      bm25Worst,
      addressCount: row.address_count,
      maxAddressCount,
      distanceMeters,
      civicInRange: civic !== null && civicWithinRange(row, civic),
    });

    return { row, score, distanceMeters };
  });

  // Ties break on popularity then text, so output is deterministic for stable caching and tests.
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      b.row.address_count - a.row.address_count ||
      suggestTextOf(a.row).localeCompare(suggestTextOf(b.row))
  );
  return scored;
}

function civicWithinRange(row: SuggestRow, civic: number): boolean {
  if (row.min_civic === null || row.max_civic === null) return false;
  return civic >= row.min_civic && civic <= row.max_civic;
}

/** Mirrors the suggest_text built by buildSuggestPopulateSql. */
function suggestTextOf(row: SuggestRow): string {
  const city = row.city_key.split('|')[0] || '';
  return `${row.street_key.replace(/\|/g, ' ')} ${city} ${row.province}`;
}

// ---------------------------------------------------------------------------
// Leaves
// ---------------------------------------------------------------------------

async function resolveLeaves(
  env: Env,
  scored: Array<{ row: SuggestRow; score: number; distanceMeters?: number }>,
  civic: number,
  unit: string,
  params: SuggestQueryParams
): Promise<Suggestion[]> {
  const out: Suggestion[] = [];
  let lookups = 0;

  for (const entry of scored) {
    const inRange = civicWithinRange(entry.row, civic);

    if (inRange && lookups < ODA_SUGGEST_DEFAULTS.MAX_LEAF_LOOKUPS) {
      lookups++;
      // Always ask about the civic itself first: its row count is what separates an address
      // from a tower, and we need it even when a unit was typed but does not exist.
      const atCivic = await queryCivic(env, entry.row, civic, '');

      if (atCivic.row && unit) {
        const exact = await queryCivic(env, entry.row, civic, unit);
        if (exact.row) {
          out.push(toLeafSuggestion(exact.row, entry.score, entry.distanceMeters));
          continue;
        }
        if (atCivic.unitTotal > 1) {
          // The unit does not exist in this building. Offer the building so the user can find
          // the right one -- returning the bare civic here would drop the unit they just typed
          // and hand back an address that looks right and is not.
          out.push(
            toBuildingSuggestion(entry.row, atCivic.row, civic, atCivic.unitTotal, entry.score, entry.distanceMeters)
          );
          continue;
        }
        // A single record and no unit data: ODA simply does not carry units for most addresses.
        // Return the civic and leave the unit in the caller's own field -- we never invent one.
        out.push(toLeafSuggestion(atCivic.row, entry.score, entry.distanceMeters));
        continue;
      }

      if (atCivic.row && atCivic.unitTotal > 1) {
        // One civic, many units -- a tower. Return the building as a container rather than
        // silently picking one of its units, which is what Canada Post does here too.
        out.push(
          toBuildingSuggestion(entry.row, atCivic.row, civic, atCivic.unitTotal, entry.score, entry.distanceMeters)
        );
        continue;
      }
      if (atCivic.row) {
        out.push(toLeafSuggestion(atCivic.row, entry.score, entry.distanceMeters));
        continue;
      }
      // Civic falls inside the street's range but has no row: report the street centroid at
      // RangedPremise rather than inventing a point, matching the existing street_interpolated
      // honesty rule in the geocoding cascade.
      out.push(toRangedSuggestion(entry.row, civic, entry.score, entry.distanceMeters));
      continue;
    }

    out.push(
      toContainerSuggestion(
        entry.row,
        entry.score,
        stripLeadingCivic(normalizeSearchToken(params.q)),
        params,
        entry.distanceMeters
      )
    );
  }

  return out;
}

/**
 * Fetch one row at a civic, plus how many distinct units share it.
 *
 * Counts DISTINCT non-empty units, not rows: ODA contains duplicate records for the same civic
 * with no unit at all, and counting rows would read those as a two-unit building. Only a real
 * spread of unit identifiers makes a civic a tower.
 *
 * The correlated subquery sees the outer row, so the count needs no extra bind parameters and
 * survives the unit filter in the WHERE clause below.
 */
async function queryCivic(
  env: Env,
  row: SuggestRow,
  civic: number,
  unit: string
): Promise<{ row: AddressRow | null; unitTotal: number }> {
  const where = ['a.province = ?', 'a.city_key = ?', 'a.street_key = ?', 'a.civic_number = ?'];
  const binds: unknown[] = [row.province, row.city_key, row.street_key, String(civic)];

  if (unit) {
    where.push('UPPER(REPLACE(a.unit, \' \', \'\')) = ?');
    binds.push(unit.replace(/\s/g, ''));
  }

  const sql = `SELECT a.civic_number, a.unit, a.postal_code, a.street_name, a.street_type,
                      a.street_direction, a.city, a.province, a.lat, a.lon, a.full_address,
                      (SELECT COUNT(DISTINCT NULLIF(u.unit, ''))
                         FROM oda_addresses u
                        WHERE u.province = a.province AND u.city_key = a.city_key
                          AND u.street_key = a.street_key AND u.civic_number = a.civic_number
                      ) AS unit_total
               FROM oda_addresses a
               WHERE ${where.join(' AND ')}
               ORDER BY CASE WHEN a.unit = '' OR a.unit IS NULL THEN 0 ELSE 1 END,
                        CAST(a.unit AS INTEGER), a.unit
               LIMIT 1`;

  const result = await env.ODA_DB!.prepare(sql).bind(...binds).first<AddressRow & { unit_total: number }>();
  if (!result) return { row: null, unitTotal: 0 };
  return { row: result, unitTotal: (result.unit_total as number) || 0 };
}

async function drillIntoContainer(
  env: Env,
  params: SuggestQueryParams,
  limit: number,
  civic: number | null,
  unit: string
): Promise<SuggestResult> {
  const container = decodeContainerId(params.containerId!);
  if (!container) {
    throw new SuggestError('Malformed containerId', 'INVALID_CONTAINER_ID', 400);
  }
  const cursor = params.cursor ? decodeCursor(params.cursor) : null;
  if (params.cursor && !cursor) {
    throw new SuggestError('Malformed cursor', 'INVALID_CURSOR', 400);
  }

  return container.civic
    ? listUnits(env, container, params, limit, cursor, unit)
    : listCivics(env, container, params, limit, cursor, civic);
}

/** Street container -> the civic numbers on it. A civic with many units becomes its own container. */
async function listCivics(
  env: Env,
  container: ContainerRef,
  params: SuggestQueryParams,
  limit: number,
  cursor: Cursor | null,
  civic: number | null
): Promise<SuggestResult> {
  const where = ['province = ?', 'city_key = ?', 'street_key = ?'];
  const binds: unknown[] = [container.province, container.cityKey, container.streetKey];

  if (civic !== null) {
    where.push('civic_number LIKE ?');
    binds.push(`${civic}%`);
  }
  if (cursor && cursor.civicNum !== undefined) {
    // Row-value comparison keeps the keyset in lockstep with ORDER BY, including "1" vs "1A".
    where.push('(CAST(civic_number AS INTEGER), civic_number) > (?, ?)');
    binds.push(cursor.civicNum, cursor.civicStr ?? '');
  }
  binds.push(limit + 1);

  // min(unit) makes the bare columns deterministic: SQLite documents that with min()/max() the
  // other columns come from the matching row, rather than an arbitrary one.
  const sql = `SELECT civic_number, min(unit) AS unit, postal_code, street_name, street_type,
                      street_direction, city, province, lat, lon, full_address,
                      COUNT(DISTINCT NULLIF(unit, '')) AS unit_total
               FROM oda_addresses
               WHERE ${where.join(' AND ')}
               GROUP BY civic_number
               ORDER BY CAST(civic_number AS INTEGER), civic_number
               LIMIT ?`;

  const result = await env.ODA_DB!.prepare(sql).bind(...binds).all<AddressRow & { unit_total: number }>();
  const all = result.results || [];
  const rows = all.slice(0, limit);

  const suggestions = rows.map((row, index) => {
    const distance = distanceFor(params, row.lat, row.lon);
    const score = 1 - index / Math.max(rows.length, 1);
    return row.unit_total > 1
      ? toBuildingSuggestionFromAddress(container, row, row.unit_total, score, distance)
      : toLeafSuggestion(row, score, distance);
  });

  const last = rows[rows.length - 1];
  return {
    suggestions,
    provinces: [container.province],
    nextCursor:
      all.length > limit && last
        ? encodeCursor({ civicNum: parseInt(last.civic_number, 10) || 0, civicStr: last.civic_number })
        : undefined,
  };
}

/** Building container -> the units in it. */
async function listUnits(
  env: Env,
  container: ContainerRef,
  params: SuggestQueryParams,
  limit: number,
  cursor: Cursor | null,
  unit: string
): Promise<SuggestResult> {
  const where = ['province = ?', 'city_key = ?', 'street_key = ?', 'civic_number = ?'];
  const binds: unknown[] = [container.province, container.cityKey, container.streetKey, container.civic];

  // Inside a building the user is typing a unit, so a bare trailing token filters units.
  const prefix = unit || unitPrefixFromQuery(params.q, container);
  if (prefix) {
    where.push('UPPER(REPLACE(unit, \' \', \'\')) LIKE ?');
    binds.push(`${prefix.replace(/\s/g, '')}%`);
  }
  if (cursor && cursor.unit !== undefined) {
    where.push('unit > ?');
    binds.push(cursor.unit);
  }
  binds.push(limit + 1);

  const sql = `SELECT civic_number, unit, postal_code, street_name, street_type, street_direction,
                      city, province, lat, lon, full_address
               FROM oda_addresses
               WHERE ${where.join(' AND ')}
               ORDER BY CAST(unit AS INTEGER), unit
               LIMIT ?`;

  const result = await env.ODA_DB!.prepare(sql).bind(...binds).all<AddressRow>();
  const all = result.results || [];
  const rows = all.slice(0, limit);

  const suggestions = rows.map((row, index) =>
    toLeafSuggestion(row, 1 - index / Math.max(rows.length, 1), distanceFor(params, row.lat, row.lon))
  );

  const last = rows[rows.length - 1];
  return {
    suggestions,
    provinces: [container.province],
    nextCursor: all.length > limit && last ? encodeCursor({ unit: last.unit || '' }) : undefined,
  };
}

/**
 * Inside a building, whatever the user typed beyond the civic and street is a unit prefix.
 * "560 BIRCHMOUNT RD 15" -> "15". Only used when no explicit unit syntax ("Unit 15", "15-560")
 * was recognised, since those parse cleanly on their own.
 */
export function unitPrefixFromQuery(q: string, container: ContainerRef): string {
  const tokens = normalizeSearchToken(q).split(' ').filter(Boolean);
  const consume = [container.civic || '', ...container.streetKey.split('|')].filter(Boolean);

  let i = 0;
  for (const expected of consume) {
    if (tokens[i] === expected) i++;
  }
  return tokens.slice(i).join(' ');
}

function distanceFor(params: SuggestQueryParams, lat: number, lon: number): number | undefined {
  return params.locationBias
    ? haversineMeters(params.locationBias.lon, params.locationBias.lat, lon, lat)
    : undefined;
}

// ---------------------------------------------------------------------------
// Row -> Suggestion
// ---------------------------------------------------------------------------

function toContainerSuggestion(
  row: SuggestRow,
  score: number,
  normalizedQuery: string,
  _params: SuggestQueryParams,
  distanceMeters?: number
): Suggestion {
  const streetLabel = formatStreetLabel(row.street_key);
  const secondary = `${row.city}, ${row.province}`;
  const text = `${streetLabel}, ${secondary}`;

  return {
    id: encodeContainerId(row.province, row.city_key, row.street_key),
    text,
    structuredFormat: {
      mainText: { text: streetLabel, matches: matchRanges(streetLabel, normalizedQuery) },
      secondaryText: { text: secondary },
    },
    description: secondary,
    types: ['street', 'container'],
    next: 'search',
    dataLevel: 'Street',
    location: { lat: row.lat, lon: row.lon },
    // Park the caret past the street name so the user can keep typing to refine within it.
    cursor: streetLabel.length + 1,
    score,
    addressCount: row.address_count,
    civicRange: { min: row.min_civic, max: row.max_civic },
    ...(distanceMeters === undefined ? {} : { distanceMeters: Math.round(distanceMeters) }),
  };
}

function toLeafSuggestion(row: AddressRow, score: number, distanceMeters?: number): Suggestion {
  const streetKey = [row.street_name, row.street_type, row.street_direction]
    .filter(Boolean)
    .join('|');
  const streetLabel = formatStreetLabel(streetKey);
  const unitPrefix = row.unit ? `${row.unit}-` : '';
  const mainText = `${unitPrefix}${row.civic_number} ${streetLabel}`.trim();
  const secondary = [row.city, row.province, row.postal_code].filter(Boolean).join(', ');

  return {
    id: `addr:${row.province}:${row.lat.toFixed(6)}:${row.lon.toFixed(6)}:${row.civic_number}${row.unit ? `:${row.unit}` : ''}`,
    text: `${mainText}, ${secondary}`,
    structuredFormat: {
      mainText: { text: mainText },
      secondaryText: { text: secondary },
    },
    description: secondary,
    types: ['address', 'premise'],
    next: 'lookup',
    dataLevel: 'Premise',
    location: { lat: row.lat, lon: row.lon },
    cursor: mainText.length,
    score,
    addressComponents: toAddressComponents(row, streetLabel),
    ...(distanceMeters === undefined ? {} : { distanceMeters: Math.round(distanceMeters) }),
  };
}

/**
 * A civic that holds many units. Returned as a container rather than an address: we know the
 * building but not which unit, and picking one would be a confident wrong answer.
 */
function buildingSuggestion(
  ref: ContainerRef,
  sample: AddressRow,
  civic: string,
  unitTotal: number,
  score: number,
  distanceMeters?: number
): Suggestion {
  const streetKey = [sample.street_name, sample.street_type, sample.street_direction]
    .filter(Boolean)
    .join('|');
  const streetLabel = formatStreetLabel(streetKey || ref.streetKey);
  const mainText = `${civic} ${streetLabel}`;
  const secondary = [sample.city, sample.province, sample.postal_code].filter(Boolean).join(', ');

  return {
    id: encodeContainerId(ref.province, ref.cityKey, ref.streetKey, civic),
    text: `${mainText}, ${secondary}`,
    structuredFormat: {
      mainText: { text: mainText },
      secondaryText: { text: secondary },
    },
    description: secondary,
    types: ['address', 'building', 'container'],
    next: 'search',
    // Still premise-level precision: we have the building, just not the unit.
    dataLevel: 'Premise',
    location: { lat: sample.lat, lon: sample.lon },
    cursor: mainText.length + 1,
    score,
    addressCount: unitTotal,
    unitCount: unitTotal,
    ...(distanceMeters === undefined ? {} : { distanceMeters: Math.round(distanceMeters) }),
  };
}

function toBuildingSuggestion(
  row: SuggestRow,
  sample: AddressRow,
  civic: number,
  unitTotal: number,
  score: number,
  distanceMeters?: number
): Suggestion {
  return buildingSuggestion(
    { province: row.province, cityKey: row.city_key, streetKey: row.street_key },
    sample,
    String(civic),
    unitTotal,
    score,
    distanceMeters
  );
}

function toBuildingSuggestionFromAddress(
  container: ContainerRef,
  row: AddressRow,
  unitTotal: number,
  score: number,
  distanceMeters?: number
): Suggestion {
  return buildingSuggestion(container, row, row.civic_number, unitTotal, score, distanceMeters);
}

function toRangedSuggestion(
  row: SuggestRow,
  civic: number,
  score: number,
  distanceMeters?: number
): Suggestion {
  const parsedStreet = parseStreetKey(row.street_key);
  const streetLabel = formatStreetLabel(row.street_key);
  const mainText = `${civic} ${streetLabel}`;
  const secondary = `${row.city}, ${row.province}`;

  return {
    id: encodeContainerId(row.province, row.city_key, row.street_key),
    text: `${mainText}, ${secondary}`,
    structuredFormat: {
      mainText: { text: mainText },
      secondaryText: { text: secondary },
    },
    description: secondary,
    types: ['address', 'ranged'],
    next: 'lookup',
    // The civic is in range but has no row: the point is the street centroid, not this address.
    dataLevel: 'RangedPremise',
    location: { lat: row.lat, lon: row.lon },
    cursor: mainText.length,
    score,
    civicRange: { min: row.min_civic, max: row.max_civic },
    addressComponents: {
      civic_number: String(civic),
      street_name: parsedStreet.streetName,
      street_type: parsedStreet.streetType || undefined,
      street_direction: parsedStreet.streetDirection || undefined,
      locality: row.city,
      administrative_area_level_1: row.province,
      country: 'CA',
      formatted_address: `${mainText}, ${secondary}`,
    },
    ...(distanceMeters === undefined ? {} : { distanceMeters: Math.round(distanceMeters) }),
  };
}

function toAddressComponents(row: AddressRow, streetLabel: string): OdaAddressComponents {
  return {
    civic_number: row.civic_number,
    street_name: row.street_name || undefined,
    street_type: row.street_type || undefined,
    street_direction: row.street_direction || undefined,
    unit: row.unit || undefined,
    locality: row.city || undefined,
    administrative_area_level_1: row.province,
    postal_code: row.postal_code || undefined,
    country: 'CA',
    formatted_address:
      row.full_address ||
      `${row.civic_number} ${streetLabel}, ${[row.city, row.province, row.postal_code].filter(Boolean).join(', ')}`,
  };
}

/** Google-style match ranges for bolding the matched prefix in the UI. */
function matchRanges(label: string, normalizedQuery: string): Array<{ startOffset: number; endOffset: number }> {
  if (!normalizedQuery) return [];
  const haystack = normalizeSearchToken(label);
  const ranges: Array<{ startOffset: number; endOffset: number }> = [];

  for (const token of normalizedQuery.split(' ').filter(Boolean)) {
    const at = haystack.indexOf(token);
    if (at >= 0) ranges.push({ startOffset: at, endOffset: at + token.length });
  }
  return ranges;
}
