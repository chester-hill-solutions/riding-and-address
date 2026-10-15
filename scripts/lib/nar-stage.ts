import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { stageNarRecord, strictNarCoordinates, type StagedSource } from '../../src/nar-delta';

export interface SourceManifest {
  schema: 1;
  vintage: string;
  province: string;
  provinceComplete: boolean;
  completenessEvidence: string;
  parts: Array<{ kind: 'addresses' | 'locations'; path: string; sha256: string; rows: number }>;
}

/** Strict RFC-4180 records, including quoted newlines; malformed/truncated input fails closed. */
export function parseCsv(text: string): Array<Record<string, string>> {
  const records: string[][] = [];
  let cells: string[] = [], cell = '', quoted = false, closedQuote = false;
  const endCell = () => { cells.push(cell); cell = ''; closedQuote = false; };
  const endRow = () => {
    endCell();
    if (cells.some((value) => value.trim())) records.push(cells);
    cells = [];
  };
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else { quoted = false; closedQuote = true; }
      } else cell += char;
    } else if (char === '"') {
      if (cell || closedQuote) throw new Error('Unexpected CSV quote');
      quoted = true;
    } else if (char === ',') endCell();
    else if (char === '\r' || char === '\n') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      endRow();
    } else {
      if (closedQuote) throw new Error('Text after CSV closing quote');
      cell += char;
    }
  }
  if (quoted) throw new Error('Unclosed CSV quote');
  if (cell || cells.length || closedQuote) endRow();
  const header = records.shift();
  if (!header || header.some((key) => !key) || new Set(header).size !== header.length) throw new Error('Missing/duplicate CSV header');
  return records.map((values) => {
    if (values.length !== header.length) throw new Error('Truncated or extra CSV columns');
    return Object.fromEntries(header.map((key, i) => [key, values[i].trim()]));
  });
}

/** Small offline planning slice. Large archives need an out-of-core stage before production support. */
export function stageManifest(path: string, maxBytes = 100 * 1024 * 1024): StagedSource {
  const manifestBytes = readFileSync(path);
  const manifest = JSON.parse(manifestBytes.toString('utf8')) as SourceManifest;
  if (manifest.schema !== 1 || !/^\d{6}$/.test(manifest.vintage) || !Array.isArray(manifest.parts) || !manifest.parts.length) {
    throw new Error('Invalid source manifest');
  }
  const parts: Array<{ kind: string; records: Array<Record<string, string>> }> = [];
  const paths = new Set<string>();
  const hash = createHash('sha256').update(manifestBytes);
  let bytes = 0;
  for (const part of manifest.parts) {
    const partPath = realpathSync(resolve(dirname(path), part.path));
    if (!['addresses', 'locations'].includes(part.kind) || paths.has(partPath)) throw new Error('Duplicate/invalid manifest part');
    paths.add(partPath);
    bytes += statSync(partPath).size;
    if (bytes > maxBytes) throw new Error('Offline stage exceeds 100 MiB limit; use a reviewed out-of-core stage, not an archive download');
    const content = readFileSync(partPath);
    const checksum = createHash('sha256').update(content).digest('hex');
    if (checksum !== part.sha256) throw new Error(`Part checksum mismatch: ${part.path}`);
    const records = parseCsv(content.toString('utf8'));
    if (!Number.isSafeInteger(part.rows) || part.rows < 0 || records.length !== part.rows) throw new Error(`Part row-count mismatch: ${part.path}`);
    hash.update(checksum);
    parts.push({ kind: part.kind, records });
  }
  if (!parts.some((part) => part.kind === 'addresses')) throw new Error('Manifest has no address parts');
  const locations = new Map<string, { lat: number; lon: number }>();
  for (const part of parts.filter((p) => p.kind === 'locations')) for (const record of part.records) {
    const guid = record.LOC_GUID?.trim();
    const coords = strictNarCoordinates(record);
    if (!guid || !coords || locations.has(guid)) throw new Error('Missing/duplicate location GUID or unresolved location coordinates');
    locations.set(guid, coords);
  }
  const stage: StagedSource = {
    vintage: manifest.vintage, province: manifest.province,
    provinceComplete: manifest.provinceComplete === true,
    completenessEvidence: manifest.completenessEvidence ?? '',
    manifestHash: hash.digest('hex'), rawRows: 0, rejectedRows: 0, records: [],
  };
  const guids = new Set<string>();
  for (const part of parts.filter((p) => p.kind === 'addresses')) for (const record of part.records) {
    stage.rawRows++;
    // Duplicate identity is not a skipped row: it invalidates the entire stage.
    if (guids.has(record.ADDR_GUID)) throw new Error('Duplicate source ADDR_GUID');
    guids.add(record.ADDR_GUID);
    try {
      const coords = locations.size ? locations.get(record.LOC_GUID) : undefined;
      if (parts.some((p) => p.kind === 'locations') && !coords) throw new Error('Unresolved coordinate join');
      const normalized = stageNarRecord(record, coords);
      if (normalized.row.province !== manifest.province) throw new Error('Source province mismatch');
      stage.records.push(normalized);
    } catch {
      stage.rejectedRows++;
    }
  }
  stage.records.sort((a, b) => a.addrGuid.localeCompare(b.addrGuid));
  return stage;
}
