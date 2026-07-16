import { normalizeSearchToken } from './oda-normalize';

/**
 * ODA records municipalities under their legal or pre-amalgamation names, which are
 * frequently not what a caller types. Toronto is the worst case: the city_key
 * `TORONTO|ON` does not exist at all, because its ~527k addresses are filed under the
 * six municipalities that amalgamated in 1998. Hamilton is filed as `CITY OF HAMILTON`,
 * and Quebec City as `QUEBEC CITY`.
 *
 * Without expansion those addresses are unreachable: `city` is a component of both
 * `search_key` and `city_key`, so a query for "Toronto" matches zero rows and falls
 * through to an external geocoder.
 *
 * Expansion is query-time on purpose. The alternative — rewriting `city` across 10M
 * rows — would destroy the provenance of the StatCan data and still need this mapping
 * to decide what to rewrite to.
 */

/**
 * Legal/administrative prefixes ODA prepends to a municipality's plain name.
 *
 * Only prefixes that actually occur in oda_city_centroids are listed. Every extra entry
 * multiplies the candidate keys of every query for no benefit, and the bound-parameter
 * ceiling on a D1 query is finite — speculative prefixes cost real headroom.
 */
const ADMIN_PREFIXES = [
  'CITY OF',
  'TOWN OF',
  'TOWNSHIP OF',
  'COUNTY OF',
  'VILLAGE OF',
  'REGIONAL MUNICIPALITY OF',
  'FORMER',
] as const;

/**
 * Cases where the everyday name is not a prefix-variant of the stored name, so no
 * mechanical rule recovers them. Keys and values are normalized city tokens.
 *
 * Verified against oda_city_centroids; the counts are the addresses each unlocks.
 */
const CITY_ALIASES: Record<string, readonly string[]> = {
  // TORONTO|ON does not exist in ODA. Its addresses live under the six pre-1998
  // municipalities. Ordered by address count.
  'TORONTO|ON': [
    'FORMER TORONTO', // 158,005
    'SCARBOROUGH', //   124,138
    'NORTH YORK', //    114,602
    'ETOBICOKE', //      73,669
    'YORK', //           32,492
    'EAST YORK', //      24,120
  ],
  // QUEBEC|QC does not exist; the city is stored as QUEBEC CITY (185,490).
  'QUEBEC|QC': ['QUEBEC CITY'],
};

/**
 * Every ODA spelling of `city` worth trying, most-literal first.
 *
 * The caller's own spelling is always index 0 so it can win over any alias: an address
 * that genuinely exists in the named municipality must never be resolved to a
 * same-named street in a neighbouring one.
 */
export function expandCityCandidates(
  city: string | undefined,
  province: string | undefined
): string[] {
  const normalized = normalizeSearchToken(city);
  if (!normalized) return [];

  const candidates: string[] = [normalized];
  const push = (value: string) => {
    const token = normalizeSearchToken(value);
    if (token && !candidates.includes(token)) candidates.push(token);
  };

  // Curated aliases for amalgamations and renames.
  for (const alias of CITY_ALIASES[`${normalized}|${province ?? ''}`] ?? []) {
    push(alias);
  }

  // "Hamilton" -> "CITY OF HAMILTON". ODA is inconsistent about which prefix it uses,
  // so try each; a wrong guess simply matches no rows.
  for (const prefix of ADMIN_PREFIXES) {
    push(`${prefix} ${normalized}`);
  }

  // The inverse: caller typed the legal name but ODA stores the plain one, or the
  // stripped name has its own curated aliases ("City of Toronto" -> the six).
  for (const prefix of ADMIN_PREFIXES) {
    if (!normalized.startsWith(`${prefix} `)) continue;
    const stripped = normalizeSearchToken(normalized.slice(prefix.length + 1));
    if (!stripped) continue;
    push(stripped);
    for (const alias of CITY_ALIASES[`${stripped}|${province ?? ''}`] ?? []) {
      push(alias);
    }
  }

  return candidates;
}
