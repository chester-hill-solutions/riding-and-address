import { afterEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { getOdaBaseSchemaSql } from '../src/oda-schema';
import {
  fsaRange, fsaSelect, NO_POSTAL, planNarDelta, stageNarRecord,
  type BaselineRecord, type BaselineSnapshot, type SourceRecord, type StagedSource,
} from '../src/nar-delta';
import { parseCsv, stageManifest, type SourceManifest } from '../scripts/lib/nar-stage';

const dirs: string[] = [];
function directory(): string { const path = mkdtempSync(join(tmpdir(), 'nar-delta-')); dirs.push(path); return path; }
afterEach(() => { for (const path of dirs.splice(0)) rmSync(path, { recursive: true, force: true }); });

function raw(id: string, postal = 'M5V2T6', extra: Record<string, string> = {}): Record<string, string> {
  return { ADDR_GUID: id, LOC_GUID: `location-${id}`, CIVIC_NO: '123', MAIL_STREET_NAME: 'MAIN',
    MAIL_STREET_TYPE: 'ST', MAIL_MUN_NAME: 'TORONTO', MAIL_PROV_ABVN: 'ON',
    MAIL_POSTAL_CODE: postal, BF_REPPOINT_LATITUDE: '43', BF_REPPOINT_LONGITUDE: '-79', ...extra };
}
function record(id: string, postal = 'M5V2T6', extra: Record<string, string> = {}): SourceRecord {
  return stageNarRecord(raw(id, postal, extra));
}
function old(record: SourceRecord, id: number): BaselineRecord { return { ...record, id }; }
function source(records: SourceRecord[], extra: Partial<StagedSource> = {}): StagedSource {
  return { vintage: '202606', province: 'ON', provinceComplete: true,
    completenessEvidence: 'fixture part inventory checked', manifestHash: 'fixture',
    rawRows: records.length, rejectedRows: 0, records, ...extra };
}
function baseline(records: BaselineRecord[], extra: Partial<BaselineSnapshot> = {}): BaselineSnapshot {
  return { vintage: '202606', province: 'ON', provinceComplete: true,
    completenessEvidence: 'complete local fixture snapshot', records, legacyMappings: [], completedCities: [], ...extra };
}
function plan(before: BaselineRecord[], after: SourceRecord[], partitions = ['M5V']) {
  return planNarDelta({ baseline: baseline(before), source: source(after), partitions,
    identity: { mode: 'same-vintage', evidence: 'same fixture vintage with unique address IDs' } });
}

describe('offline NAR FSA delta', () => {
  it('keeps unchanged normalized rows out of mutations/provenance and never claims a total D1 bound', () => {
    const row = record('a');
    const result = plan([old(row, 41)], [row]);
    expect(result.counts).toMatchObject({ old: 1, new: 1, unchanged: 1, add: 0, update: 0, delete: 0 });
    expect(result.changes).toEqual([]);
    expect(result.provenance).toEqual([]);
    expect(result.estimate.addressIndexWritesUpperBound).toBe(0);
    expect(result.estimate.totalWritesUpperBound).toBeNull();
    expect(result.executable).toBe(false);
    expect(result.cityCompletionAllowed).toBe(false);
  });

  it('reports add/update/delete counts with five-index amplification and stable row IDs', () => {
    const a = record('a'), b = record('b', 'M5V9A1');
    const result = plan([old(a, 41), old(b, 42)], [record('a', 'M5V2T6', { CIVIC_NO: '124' }), record('c')]);
    expect(result.counts).toMatchObject({ old: 2, new: 2, unchanged: 0, add: 1, update: 1, delete: 1 });
    expect(result.changes.find((c) => c.key === 'a')?.before?.id).toBe(41);
    expect(result.estimate.addressIndexWritesUpperBound).toBe(7 + 11 + 6);
    expect(result.blockers).toHaveLength(1); // Production capability/bounds deliberately unavailable.
  });

  it('does not fabricate changed/deleted identities for existing rows without source IDs', () => {
    const same = old(record('a'), 1), changed = old(record('b'), 2);
    delete same.addrGuid; delete changed.addrGuid;
    const result = plan([same, changed], [record('a'), record('b', 'M5V2T6', { CIVIC_NO: '999' })]);
    expect(result.counts.add).toBeNull();
    expect(result.counts.update).toBeNull();
    expect(result.counts.delete).toBeNull();
    // The identical payload is duplicated globally, so even the apparent equality is ambiguous.
    expect(result.counts.unchanged).toBe(0);
    expect(result.counts.unresolvedOld).toBe(2);
    expect(result.changes).toEqual([]);
    expect(result.blockers.join(' ')).toMatch(/legacy rows lack reviewed/);
  });

  it('allows only unique exact payload equality as informational evidence without IDs', () => {
    const a = record('a'), b = record('b', 'M5V9A1');
    const before = old(a, 1); delete before.addrGuid;
    const result = plan([before], [a, b]);
    expect(result.counts.unchanged).toBe(1);
    expect(result.counts.add).toBeNull();
    expect(result.changes).toEqual([]);
  });

  it('requires explicit cross-vintage identity review and reviewed bridges for legacy IDs', () => {
    const a = record('a'), before = old(a, 9); delete before.addrGuid;
    const base = baseline([before], { vintage: '202512', legacyMappings: [{ id: 9, addrGuid: 'a', evidence: 'reviewed bridge fixture' }] });
    const args = { baseline: base, source: source([record('a', 'M5V2T6', { CIVIC_NO: '124' })]), partitions: ['M5V'] };
    expect(planNarDelta({ ...args, identity: { mode: 'same-vintage', evidence: 'incorrect' } }).counts.update).toBeNull();
    const reviewed = planNarDelta({ ...args, identity: { mode: 'reviewed-cross-vintage', evidence: 'fixture-specific reviewed mapping; no StatCan stability claim' } });
    expect(reviewed.counts.update).toBe(1);
    expect(reviewed.changes[0].before?.id).toBe(9);
  });

  it('refuses duplicate GUIDs and conflicting/absent legacy mappings', () => {
    const a = record('a');
    expect(() => plan([old(a, 1), old(a, 2)], [a])).toThrow(/Duplicate baseline/);
    expect(() => plan([], [a, a])).toThrow(/duplicate source/);
    expect(() => planNarDelta({ source: source([a]), baseline: baseline([old(a, 1)], { legacyMappings: [{ id: 1, addrGuid: 'wrong', evidence: 'review' }] }), partitions: ['M5V'], identity: { mode: 'same-vintage', evidence: 'review' } })).toThrow(/conflicts/);
  });

  it('assigns FSA moves to the old partition and blocks incoming moves without their owner', () => {
    const a = record('a'), moved = record('a', 'M5G2K6');
    const incoming = plan([old(a, 1)], [moved], ['M5G']);
    expect(incoming.blockers.join(' ')).toMatch(/owned by M5V/);
    expect(incoming.changes).toEqual([]);
    const both = plan([old(a, 1)], [moved], ['M5V', 'M5G']);
    expect(both.counts).toMatchObject({ add: 0, update: 1, delete: 0 });
    expect(both.changes[0].owner).toBe('M5V');
    expect(both.provenance[0]).toMatchObject({ oldPartition: 'M5V', newPartition: 'M5G' });
  });

  it('retains missing postal rows in a separate partition and preserves address/location GUIDs', () => {
    const a = record('a', '');
    expect(a.addrGuid).toBe('a'); expect(a.locGuid).toBe('location-a');
    const result = plan([], [a], [NO_POSTAL]);
    expect(result.counts).toMatchObject({ new: 1, add: 1, missingPostalNew: 1 });
    expect(result.changes[0].owner).toBe(NO_POSTAL);
    expect(result.aggregates.postal).toEqual([]);
    expect(result.aggregates.city[0].count).toBe(1);
  });

  it('recomputes affected aggregates using unselected FSAs and cleans removed postals', () => {
    const a = record('a'), outside = record('b', 'M5G2K6', { BF_REPPOINT_LATITUDE: '45' });
    const updated = record('a', 'M5V9A1', { BF_REPPOINT_LATITUDE: '47' });
    const result = plan([old(a, 1), old(outside, 2)], [updated, outside]);
    expect(result.aggregates.city[0]).toMatchObject({ count: 2, lat: 46 });
    expect(result.aggregates.street[0]).toMatchObject({ count: 2, lat: 46 });
    expect(result.aggregates.postal.find((r) => r.key[1] === 'M5V 2T6')).toMatchObject({ action: 'delete', count: 0, lat: null });
    expect(result.aggregates.postal.find((r) => r.key[1] === 'M5V 9A1')).toMatchObject({ action: 'replace', count: 1, lat: 47 });
  });

  it('uses normalized eligible rows for shrink checks and rejects incomplete inputs', () => {
    const records = Array.from({ length: 10 }, (_, i) => old(record(`a${i}`), i + 1));
    const result = planNarDelta({ source: source([record('a0'), record('a1')], { rawRows: 10, rejectedRows: 8 }),
      baseline: baseline(records), partitions: ['M5V'], identity: { mode: 'same-vintage', evidence: 'fixture' } });
    expect(result.counts).toMatchObject({ rawSource: 10, normalizedSource: 2, rejectedSource: 8 });
    expect(result.blockers.join(' ')).toMatch(/Normalized replacement coverage shrank/);
    expect(result.blockers.join(' ')).toMatch(/rejected or unaccounted/);
    const incomplete = planNarDelta({ source: source([], { provinceComplete: false }), baseline: baseline([]), partitions: ['M5V'], identity: { mode: 'same-vintage', evidence: 'fixture' } });
    expect(incomplete.blockers.join(' ')).toMatch(/Complete province/);
  });

  it('does not schedule completed city/vintage claims as new work', () => {
    const a = record('a');
    const result = planNarDelta({ source: source([a]), baseline: baseline([old(a, 1)], { completedCities: [{ cityKey: 'TORONTO|ON', vintage: '202606' }] }), partitions: ['M5V'], identity: { mode: 'same-vintage', evidence: 'fixture' } });
    expect(result.blockers.join(' ')).toMatch(/Existing city completion claim TORONTO/);
  });

  it('checks known components against explicit ceilings and binds a stable plan ID to inputs', () => {
    const args = { source: source([record('a')]), baseline: baseline([]), partitions: ['M5V'], identity: { mode: 'same-vintage' as const, evidence: 'fixture' }, ceilings: { reads: 0, writes: 1 } };
    const a = planNarDelta(args), b = planNarDelta(args);
    expect(a.id).toBe(b.id);
    expect(a.blockers.join(' ')).toMatch(/exceed the write ceiling/);
    expect(a.blockers.join(' ')).toMatch(/exceeds the read ceiling/);
    expect(planNarDelta({ ...args, ceilings: { reads: 100, writes: 100 } }).id).not.toBe(a.id);
    expect(() => planNarDelta({ ...args, ceilings: { reads: NaN, writes: 100 } })).toThrow(/Ceilings/);
  });

  it('uses the existing province/postal index for normal and NULL/empty postal probes', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(getOdaBaseSchemaSql().join(';'));
    for (const partition of ['M5V', 'K1Z', NO_POSTAL]) {
      const query = fsaSelect('ON', partition);
      const details = db.prepare(`EXPLAIN QUERY PLAN ${query.sql}`).all(...query.params).map((r) => String(r.detail));
      expect(details.join(' ')).toContain('USING INDEX idx_oda_postal');
      expect(details.join(' ')).not.toMatch(/SCAN oda_addresses/);
    }
    expect(fsaRange('K1Z')).toEqual({ lower: 'K1Z', upper: 'K1[' });
    expect(() => fsaRange("M5V' OR 1=1")).toThrow(/Invalid FSA/);
    db.close();
  });
});

describe('source staging and command boundaries', () => {
  function manifest(csv: string, rows: number): string {
    const dir = directory();
    writeFileSync(join(dir, 'part.csv'), csv);
    const manifest: SourceManifest = { schema: 1, vintage: '202606', province: 'ON', provinceComplete: true,
      completenessEvidence: 'synthetic fixture, not production completeness evidence',
      parts: [{ kind: 'addresses', path: 'part.csv', sha256: createHash('sha256').update(csv).digest('hex'), rows }] };
    const path = join(dir, 'source.json'); writeFileSync(path, JSON.stringify(manifest)); return path;
  }
  it('parses quoted newlines/BOM and rejects truncated or malformed CSV', () => {
    expect(parseCsv('\uFEFFA,B\r\n"a\nquote ""x""",b\r\n')).toEqual([{ A: 'a\nquote "x"', B: 'b' }]);
    expect(() => parseCsv('A,B\n"unclosed,b')).toThrow(/Unclosed/);
    expect(() => parseCsv('A,B\na')).toThrow(/Truncated/);
    expect(() => parseCsv('A,A\na,b')).toThrow(/duplicate/);
  });
  it('verifies local part checksums/counts and counts normalized failures rather than raw matches', () => {
    const csv = 'ADDR_GUID,LOC_GUID,CIVIC_NO,MAIL_STREET_NAME,MAIL_MUN_NAME,MAIL_PROV_ABVN,MAIL_POSTAL_CODE,BF_REPPOINT_LATITUDE,BF_REPPOINT_LONGITUDE\na,l,1,MAIN,TORONTO,ON,,43,-79\nb,m,2,MAIN,TORONTO,ON,M5V2T6,,\n';
    const path = manifest(csv, 2), stage = stageManifest(path);
    expect(stage).toMatchObject({ rawRows: 2, rejectedRows: 1 });
    expect(stage.records).toHaveLength(1);
    expect(stage.records[0].row.postalCode).toBe('');
    const json = JSON.parse(readFileSync(path, 'utf8')) as SourceManifest;
    json.parts[0].rows = 3; writeFileSync(path, JSON.stringify(json));
    expect(() => stageManifest(path)).toThrow(/row-count mismatch/);
    json.parts[0].rows = 2; writeFileSync(path, JSON.stringify(json));
    writeFileSync(join(path, '..', 'part.csv'), csv + '\n');
    expect(() => stageManifest(path)).toThrow(/checksum mismatch/);
  });
  it('refuses oversized stages without downloading or silently taking a prefix', () => {
    const path = manifest('A\nx\n', 1);
    expect(() => stageManifest(path, 1)).toThrow(/out-of-core/);
  });
  it('joins several addresses to one location without treating LOC_GUID as address identity', () => {
    const csv = 'ADDR_GUID,LOC_GUID,CIVIC_NO,MAIL_STREET_NAME,MAIL_MUN_NAME,MAIL_PROV_ABVN,MAIL_POSTAL_CODE\na,shared,1,MAIN,TORONTO,ON,M5V2T6\nb,shared,2,MAIN,TORONTO,ON,M5V2T6\n';
    const path = manifest(csv, 2);
    const coords = 'LOC_GUID,BF_REPPOINT_LATITUDE,BF_REPPOINT_LONGITUDE\nshared,43,-79\n';
    writeFileSync(join(path, '..', 'locations.csv'), coords);
    const json = JSON.parse(readFileSync(path, 'utf8')) as SourceManifest;
    json.parts.push({ kind: 'locations', path: 'locations.csv', rows: 1,
      sha256: createHash('sha256').update(coords).digest('hex') });
    writeFileSync(path, JSON.stringify(json));
    const stage = stageManifest(path);
    expect(stage.rejectedRows).toBe(0);
    expect(stage.records.map((r) => [r.addrGuid, r.locGuid, r.row.lat])).toEqual([['a', 'shared', 43], ['b', 'shared', 43]]);
  });
  it('rejects malformed postal codes and out-of-range coordinates', () => {
    expect(() => stageNarRecord(raw('a', 'BAD'))).toThrow(/postal/);
    expect(() => stageNarRecord(raw('a', '', { BF_REPPOINT_LATITUDE: '999' }))).toThrow(/coordinates/);
    expect(() => stageNarRecord(raw('a', '', { BF_REPPOINT_LATITUDE: '43invalid' }))).toThrow(/coordinates/);
  });
  it('reproduces the documented synthetic dry-run without allowing production execution', () => {
    const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/plan-nar-fsa.ts',
      '--manifest', 'test/fixtures/nar/delta/source.json', '--baseline', 'test/fixtures/nar/delta/baseline.json',
      '--identity', 'test/fixtures/nar/delta/identity.json', '--partitions', 'M5V,NO_POSTAL'], { encoding: 'utf8' });
    expect(result.status).toBe(2);
    const report = JSON.parse(result.stdout);
    expect(report.counts).toMatchObject({ old: 4, new: 4, unchanged: 2, add: 1, update: 1, delete: 1 });
    expect(report.estimate).toMatchObject({ addressIndexWritesUpperBound: 24, aggregateTableWritesUpperBound: 20,
      indexedRowsReadModel: 19, totalReadsUpperBound: null, totalWritesUpperBound: null });
    expect(report.coverage).toMatchObject([{ partition: 'M5V', normalizedRows: 3 }, { partition: 'NO_POSTAL', normalizedRows: 1 }]);
    expect(report.executable).toBe(false);
  });
  it('fails production/unknown CLI flags before touching even missing local inputs', () => {
    const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/plan-nar-fsa.ts', '--execute', '--manifest', '/missing'], { encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/Production execution is unavailable/);
    expect(result.stderr).not.toMatch(/ENOENT/);
    const legacy = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/import-nar.ts', '--city', 'Toronto', '--province', 'ON', '--remote', '--force'], { encoding: 'utf8' });
    expect(legacy.status).toBe(1);
    expect(legacy.stderr).toMatch(/Legacy city replacement is disabled/);
  });
});
