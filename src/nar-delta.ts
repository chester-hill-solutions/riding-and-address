import { createHash } from 'node:crypto';
import { prepareOdaInsertRow, type OdaInsertRow } from './oda-import';
import { normalizeNarRow, type NarCoordinates } from './nar-normalize';
import { PROVINCE_NAME_TO_CODE } from './oda-normalize';

/** Offline planning only. There is deliberately no D1 transport in this module. */
export const NO_POSTAL = 'NO_POSTAL';
export const PILOT_CEILINGS = { reads: 1_000_000, writes: 100_000 };
const POSTAL = /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z]\d[ABCEGHJ-NPRSTV-Z]\d$/;
const FSA = /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z]$/;
const FIELDS: Array<keyof OdaInsertRow> = [
  'province', 'civicNumber', 'streetName', 'streetType', 'streetDirection', 'unit',
  'postalCode', 'city', 'cityKey', 'lat', 'lon', 'fullAddress', 'mailingLine1',
  'mailingLine2', 'municipality', 'provinceCode', 'mailingPostalCode', 'searchKey', 'streetKey',
];

export function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function rowFingerprint(row: OdaInsertRow): string {
  return digest(FIELDS.map((key) => row[key] ?? ''));
}

export function postalPartition(postal: string): string {
  if (!postal) return NO_POSTAL;
  const compact = postal.replace(' ', '');
  if (!POSTAL.test(compact) || (postal !== compact && postal !== `${compact.slice(0, 3)} ${compact.slice(3)}`)) {
    throw new Error(`Invalid normalized postal code: ${postal}`);
  }
  return postal.slice(0, 3);
}

/** Lexicographic prefix interval: M5V <= postal_code < M5W. No function on indexed columns. */
export function fsaRange(fsa: string): { lower: string; upper: string } {
  if (!FSA.test(fsa)) throw new Error(`Invalid FSA: ${fsa}`);
  return { lower: fsa, upper: fsa.slice(0, 2) + String.fromCharCode(fsa.charCodeAt(2) + 1) };
}

export function fsaSelect(province: string, partition: string): { sql: string; params: string[] } {
  if (PROVINCE_NAME_TO_CODE[province] !== province) throw new Error('Invalid province');
  if (partition === NO_POSTAL) {
    // Legacy rows can have NULL as well as ''. Two separately indexed probes, not COALESCE.
    return { sql: 'SELECT * FROM oda_addresses WHERE province = ? AND postal_code IS NULL UNION ALL SELECT * FROM oda_addresses WHERE province = ? AND postal_code = ?', params: [province, province, ''] };
  }
  const { lower, upper } = fsaRange(partition);
  return { sql: 'SELECT * FROM oda_addresses WHERE province = ? AND postal_code >= ? AND postal_code < ?', params: [province, lower, upper] };
}

export interface SourceRecord {
  addrGuid: string;
  locGuid: string;
  row: OdaInsertRow;
}
export interface StagedSource {
  vintage: string;
  province: string;
  /** Reviewed manifest assertion, not inferred from the number of rows that happened to parse. */
  provinceComplete: boolean;
  completenessEvidence: string;
  manifestHash: string;
  rawRows: number;
  rejectedRows: number;
  records: SourceRecord[];
}
export interface BaselineRecord {
  id: number;
  addrGuid?: string;
  locGuid?: string;
  row: OdaInsertRow;
}
export interface BaselineSnapshot {
  vintage: string;
  province: string;
  provinceComplete: boolean;
  completenessEvidence: string;
  records: BaselineRecord[];
  /** An explicit human-reviewed bridge for legacy row IDs; never guessed from LOC_GUID. */
  legacyMappings: Array<{ id: number; addrGuid: string; evidence: string }>;
  completedCities: Array<{ cityKey: string; vintage: string }>;
}
export interface IdentityReview {
  mode: 'unverified' | 'same-vintage' | 'reviewed-cross-vintage';
  evidence: string;
}
export interface Change {
  key: string;
  kind: 'add' | 'update' | 'delete';
  owner: string;
  before?: BaselineRecord;
  after?: SourceRecord;
}
export interface Aggregate {
  key: string[];
  action: 'replace' | 'delete';
  count: number;
  lat: number | null;
  lon: number | null;
  minCivic?: number | null;
  maxCivic?: number | null;
}
export interface DeltaPlan {
  schema: 1;
  id: string;
  mode: 'offline-dry-run';
  province: string;
  vintage: string;
  partitions: string[];
  blockers: string[];
  counts: {
    classification: 'complete-input' | 'indeterminate';
    rawSource: number; normalizedSource: number; rejectedSource: number;
    old: number; new: number; unchanged: number;
    add: number | null; update: number | null; delete: number | null;
    unresolvedOld: number; unresolvedNew: number; missingPostalOld: number; missingPostalNew: number;
  };
  changes: Change[];
  aggregates: { postal: Aggregate[]; city: Aggregate[]; street: Aggregate[] };
  provenance: Array<{ addrGuid: string; oldPartition: string | null; newPartition: string | null; vintage: string }>;
  coverage: Array<{ partition: string; vintage: string; sourceManifestHash: string; oldRows: number; normalizedRows: number; shrinkReviewRequired: boolean }>;
  /** A partial FSA never marks an entire city complete. Runtime provenance needs a future migration. */
  cityCompletionAllowed: false;
  estimate: {
    addressIndexWritesUpperBound: number | null;
    aggregateTableWritesUpperBound: number | null;
    indexedRowsReadModel: number | null;
    totalReadsUpperBound: null;
    totalWritesUpperBound: null;
    excluded: string[];
  };
  ceilings: { reads: number; writes: number };
  executable: false;
}

function validateRow(row: OdaInsertRow, province: string): void {
  if (!row || row.province !== province || PROVINCE_NAME_TO_CODE[province] !== province ||
      !Number.isFinite(row.lat) || Math.abs(row.lat) > 90 ||
      !Number.isFinite(row.lon) || Math.abs(row.lon) > 180 ||
      !row.cityKey || !row.city || !row.streetName || !row.civicNumber) {
    throw new Error('Invalid normalized address/province/coordinates');
  }
  for (const key of FIELDS) {
    if (key !== 'lat' && key !== 'lon' && key !== 'mailingLine2' && typeof row[key] !== 'string') {
      throw new Error(`Invalid normalized field: ${key}`);
    }
  }
  postalPartition(row.postalCode);
  const rebuilt = prepareOdaInsertRow({ ...row });
  for (const key of ['mailingLine1', 'mailingLine2', 'municipality', 'provinceCode', 'mailingPostalCode'] as const) {
    if ((rebuilt[key] ?? '') !== (row[key] ?? '')) throw new Error(`Stale normalized mailing field: ${key}`);
  }
}

/** Preserve both source IDs locally, but never claim that a LOC_GUID identifies a unit/address. */
export function stageNarRecord(raw: Record<string, string>, coords?: { lat: number; lon: number }): SourceRecord {
  const addrGuid = (raw.ADDR_GUID ?? '').trim();
  const locGuid = (raw.LOC_GUID ?? '').trim();
  if (!addrGuid || !locGuid) throw new Error('Missing ADDR_GUID/LOC_GUID');
  const point = coords ?? strictNarCoordinates(raw);
  if (!point) throw new Error('Address cannot be normalized with valid coordinates');
  const normalized = normalizeNarRow(raw, point);
  if (!normalized) throw new Error('Address cannot be normalized with valid coordinates');
  if ((raw.MAIL_POSTAL_CODE ?? '').trim() && !normalized.postalCode) throw new Error('Malformed source postal code');
  const row = prepareOdaInsertRow(normalized);
  validateRow(row, row.province);
  return { addrGuid, locGuid, row };
}

/** Source staging must reject numeric prefixes such as "43invalid" rather than parseFloat them. */
export function strictNarCoordinates(raw: Record<string, string>): NarCoordinates | undefined {
  for (const prefix of ['BF_REPPOINT', 'BG', 'REPPOINT']) {
    const latitude = raw[`${prefix}_LATITUDE`]?.trim();
    const longitude = raw[`${prefix}_LONGITUDE`]?.trim();
    if (!latitude || !longitude) continue;
    const lat = Number(latitude), lon = Number(longitude);
    if (Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lon) && Math.abs(lon) <= 180) return { lat, lon };
  }
  return undefined;
}

function groupsFor(row: OdaInsertRow): { postal: string[] | null; city: string[]; street: string[] } {
  return {
    postal: row.postalCode ? [row.province, row.postalCode] : null,
    city: [row.province, row.cityKey],
    street: [row.province, row.cityKey, row.streetKey],
  };
}

export function planNarDelta(input: {
  source: StagedSource; baseline: BaselineSnapshot; identity: IdentityReview;
  partitions: string[]; ceilings?: { reads: number; writes: number };
  shrinkReview?: string;
}): DeltaPlan {
  const { source, baseline, identity } = input;
  if (!/^\d{6}$/.test(source.vintage) || typeof baseline.vintage !== 'string' || !baseline.vintage.trim() ||
      PROVINCE_NAME_TO_CODE[source.province] !== source.province || !source.manifestHash ||
      !Number.isSafeInteger(source.rawRows) || source.rawRows < 0 ||
      !Number.isSafeInteger(source.rejectedRows) || source.rejectedRows < 0) {
    throw new Error('Invalid snapshot/source header or counts');
  }
  const partitions = [...new Set(input.partitions)].sort();
  if (!partitions.length) throw new Error('Select at least one FSA or NO_POSTAL');
  for (const partition of partitions) if (partition !== NO_POSTAL) fsaRange(partition);
  const ceilings = input.ceilings ?? PILOT_CEILINGS;
  for (const value of Object.values(ceilings)) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('Ceilings must be nonnegative safe integers');
  }
  if (source.province !== baseline.province) throw new Error('Snapshot province mismatch');
  const blockers: string[] = [];
  const completeInputs = source.provinceComplete === true && Boolean(source.completenessEvidence.trim()) &&
    baseline.provinceComplete === true && Boolean(baseline.completenessEvidence.trim());
  if (!completeInputs) {
    blockers.push('Complete province source and baseline evidence is required for movement/deletion and cross-FSA aggregates.');
  }
  const rejectedOrUnaccounted = source.rejectedRows > 0 || source.rawRows !== source.records.length;
  if (rejectedOrUnaccounted) {
    blockers.push('Source has rejected or unaccounted-for rows; raw matches are not valid replacement rows.');
  }
  const selected = (row: OdaInsertRow) => partitions.includes(postalPartition(row.postalCode));
  const oldByGuid = new Map<string, BaselineRecord>();
  const newByGuid = new Map<string, SourceRecord>();
  const ids = new Set<number>();
  const mappings = new Map<number, string>();
  for (const mapping of baseline.legacyMappings) {
    if (!mapping.evidence.trim() || !mapping.addrGuid || mappings.has(mapping.id)) throw new Error('Invalid/duplicate reviewed legacy mapping');
    mappings.set(mapping.id, mapping.addrGuid);
  }
  const old = baseline.records.map((entry) => {
    validateRow(entry.row, baseline.province);
    if (!Number.isSafeInteger(entry.id) || entry.id <= 0 || ids.has(entry.id)) throw new Error('Invalid/duplicate baseline row ID');
    ids.add(entry.id);
    const mapped = mappings.get(entry.id);
    if (entry.addrGuid && mapped && entry.addrGuid !== mapped) throw new Error('Legacy mapping conflicts with source ID');
    const row = { ...entry, addrGuid: entry.addrGuid || mapped };
    if (row.addrGuid) {
      if (oldByGuid.has(row.addrGuid)) throw new Error('Duplicate baseline ADDR_GUID');
      oldByGuid.set(row.addrGuid, row);
    }
    return row;
  });
  for (const id of mappings.keys()) if (!ids.has(id)) throw new Error('Legacy mapping refers to absent row');
  for (const record of source.records) {
    validateRow(record.row, source.province);
    if (!record.addrGuid || !record.locGuid || newByGuid.has(record.addrGuid)) throw new Error('Missing/duplicate source GUID');
    newByGuid.set(record.addrGuid, record);
  }
  const validIdentity = identity.evidence.trim() &&
    ((identity.mode === 'same-vintage' && source.vintage === baseline.vintage) || identity.mode === 'reviewed-cross-vintage');
  const unmapped = old.filter((r) => !r.addrGuid);
  // Incomplete source coverage can look exactly like a real deletion. Do not emit actionable
  // mutations, aggregate replacements or cost components just because the surviving IDs match.
  const classificationBlocked = !validIdentity || unmapped.length > 0 || !completeInputs || rejectedOrUnaccounted;
  if (!validIdentity) blockers.push('GUID stability is unverified; supply a same-vintage or reviewed cross-vintage identity assessment.');
  if (unmapped.length) blockers.push(`${unmapped.length} legacy rows lack reviewed source identity; changed/deleted/moved rows cannot be classified reliably.`);

  const oldScope = old.filter((r) => selected(r.row));
  const newScope = source.records.filter((r) => selected(r.row));
  let unchanged = 0;
  const changes: Change[] = [];
  if (!classificationBlocked) {
    for (const before of old) {
      const after = newByGuid.get(before.addrGuid!);
      const owner = postalPartition(before.row.postalCode);
      if (after && selected(after.row) && !partitions.includes(owner)) {
        blockers.push(`Incoming ${after.addrGuid} is owned by ${owner}; include its old partition to reconcile movement.`);
      }
      if (!partitions.includes(owner)) continue;
      if (after && rowFingerprint(before.row) === rowFingerprint(after.row)) { unchanged++; continue; }
      changes.push({ key: before.addrGuid!, kind: after ? 'update' : 'delete', owner, before, after });
    }
    for (const after of newScope) {
      if (!oldByGuid.has(after.addrGuid)) changes.push({ key: after.addrGuid, kind: 'add', owner: postalPartition(after.row.postalCode), after });
    }
  } else {
    // Only exact, globally unique payload matches are knowable without source identity.
    // They are informational, never used to infer a deletion/addition or persist a bridge.
    const oldHashes = new Map<string, number>();
    const newHashes = new Map<string, number>();
    for (const r of old) { const h = rowFingerprint(r.row); oldHashes.set(h, (oldHashes.get(h) ?? 0) + 1); }
    for (const r of source.records) { const h = rowFingerprint(r.row); newHashes.set(h, (newHashes.get(h) ?? 0) + 1); }
    unchanged = oldScope.filter((r) => oldHashes.get(rowFingerprint(r.row)) === 1 && newHashes.get(rowFingerprint(r.row)) === 1).length;
  }
  changes.sort((a, b) => a.owner.localeCompare(b.owner) || a.key.localeCompare(b.key));
  const coverage = partitions.map((partition) => {
    const oldRows = oldScope.filter((record) => postalPartition(record.row.postalCode) === partition).length;
    const normalizedRows = newScope.filter((record) => postalPartition(record.row.postalCode) === partition).length;
    const shrinkReviewRequired = oldRows > 0 && normalizedRows < oldRows * 0.5;
    if (shrinkReviewRequired && !input.shrinkReview?.trim()) {
      blockers.push(`Normalized replacement coverage shrank below 50% in ${partition} (${oldRows} old, ${normalizedRows} new); reviewed deletion/movement evidence is required.`);
    }
    return { partition, vintage: source.vintage, sourceManifestHash: source.manifestHash, oldRows, normalizedRows, shrinkReviewRequired };
  });
  const involvedCities = new Set([...oldScope, ...newScope].map((r) => r.row.cityKey));
  for (const claim of baseline.completedCities) {
    if (claim.vintage === source.vintage && involvedCities.has(claim.cityKey)) {
      blockers.push(`Existing city completion claim ${claim.cityKey}/${claim.vintage}: reconcile its identity/provenance before scheduling new work.`);
    }
  }
  const resulting = new Map(old.map((r) => [r.addrGuid ?? `legacy:${r.id}`, r.row]));
  for (const change of changes) {
    if (change.after) resulting.set(change.key, change.after.row);
    else resulting.delete(change.key);
  }
  const affected = { postal: new Map<string, string[]>(), city: new Map<string, string[]>(), street: new Map<string, string[]>() };
  for (const change of changes) for (const record of [change.before, change.after]) {
    if (!record) continue;
    const groups = groupsFor(record.row);
    for (const kind of ['postal', 'city', 'street'] as const) {
      const key = groups[kind];
      if (key) affected[kind].set(JSON.stringify(key), key);
    }
  }
  let aggregateReads = 0;
  const aggregate = (kind: keyof typeof affected): Aggregate[] => [...affected[kind].values()].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))).map((key) => {
    // Full local baseline context, including rows in unselected FSAs. No remote table scan.
    const rows = [...resulting.values()].filter((row) => JSON.stringify(groupsFor(row)[kind]) === JSON.stringify(key));
    aggregateReads += rows.length;
    const civicNumbers = kind === 'street' ? rows.map((r) => Number.parseInt(r.civicNumber.replace(/[^0-9].*$/, ''), 10)).filter(Number.isFinite) : [];
    return { key, action: rows.length ? 'replace' : 'delete', count: rows.length,
      lat: rows.length ? rows.reduce((sum, r) => sum + r.lat, 0) / rows.length : null,
      lon: rows.length ? rows.reduce((sum, r) => sum + r.lon, 0) / rows.length : null,
      ...(kind === 'street' ? { minCivic: civicNumbers.length ? civicNumbers.reduce((a, b) => Math.min(a, b)) : null,
        maxCivic: civicNumbers.length ? civicNumbers.reduce((a, b) => Math.max(a, b)) : null } : {}) };
  });
  const aggregates = { postal: aggregate('postal'), city: aggregate('city'), street: aggregate('street') };
  const writes = classificationBlocked ? null : changes.reduce((sum, c) => sum + ({ add: 7, update: 11, delete: 6 })[c.kind], 0);
  const aggregateWrites = classificationBlocked ? null : 4 * Object.values(aggregates).reduce((sum, g) => sum + g.length, 0);
  const reads = classificationBlocked ? null : oldScope.length + changes.filter((c) => c.before).length + aggregateReads;
  if (writes !== null && writes + (aggregateWrites ?? 0) > ceilings.writes) blockers.push('Known address/index/aggregate writes already exceed the write ceiling.');
  if (reads !== null && reads > ceilings.reads) blockers.push('Indexed row-read model already exceeds the read ceiling.');
  // No empirical D1 bound exists yet for internal FTS writes, schema/provenance, retries or export reads.
  // Do not turn a partial estimate into a promise that paid usage is bounded.
  blockers.push('Production execution is unavailable: validated bounds for FTS, row provenance, receipts and snapshot reads, plus distributed writer fencing, are required.');
  const plan = {
    schema: 1 as const, mode: 'offline-dry-run' as const, province: source.province, vintage: source.vintage,
    partitions, blockers: [...new Set(blockers)],
    counts: { classification: classificationBlocked ? 'indeterminate' as const : 'complete-input' as const,
      rawSource: source.rawRows, normalizedSource: source.records.length, rejectedSource: source.rejectedRows,
      old: oldScope.length, new: newScope.length, unchanged,
      add: classificationBlocked ? null : changes.filter((c) => c.kind === 'add').length,
      update: classificationBlocked ? null : changes.filter((c) => c.kind === 'update').length,
      delete: classificationBlocked ? null : changes.filter((c) => c.kind === 'delete').length,
      unresolvedOld: classificationBlocked ? oldScope.length - unchanged : 0,
      unresolvedNew: classificationBlocked ? newScope.length - unchanged : 0,
      missingPostalOld: old.filter((r) => !r.row.postalCode).length,
      missingPostalNew: source.records.filter((r) => !r.row.postalCode).length },
    changes, aggregates,
    provenance: changes.map((c) => ({ addrGuid: c.key, oldPartition: c.before ? postalPartition(c.before.row.postalCode) : null,
      newPartition: c.after ? postalPartition(c.after.row.postalCode) : null, vintage: source.vintage })),
    // A partial/untrusted input cannot substantiate a per-FSA coverage claim, even in a
    // non-executable report. Keep only the observed counts and diagnostic blockers above.
    coverage: classificationBlocked ? [] : coverage,
    cityCompletionAllowed: false as const,
    estimate: { addressIndexWritesUpperBound: writes, aggregateTableWritesUpperBound: aggregateWrites,
      indexedRowsReadModel: reads, totalReadsUpperBound: null, totalWritesUpperBound: null,
      excluded: ['initial remote snapshot reads', 'FTS posting/index internals', 'row/FSA provenance schema and writes', 'atomic receipts and fencing', 'all retries/reconciliation reads'] },
    ceilings, executable: false as const,
  };
  return { ...plan, id: digest({ plan, manifest: source.manifestHash, baseline: digest(baseline), identity, shrinkReview: input.shrinkReview ?? '' }) };
}
