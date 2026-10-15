import { afterEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { digest, NO_POSTAL, planNarDelta, stageNarRecord, type BaselineSnapshot, type StagedSource } from '../src/nar-delta';
import { runLocalRehearsal, type LocalReceiptTransport } from '../scripts/lib/nar-rehearsal';

function address(id: string, postal = 'M5V2T6') {
  return stageNarRecord({ ADDR_GUID: id, LOC_GUID: `loc-${id}`, CIVIC_NO: '123',
    MAIL_STREET_NAME: 'MAIN', MAIL_STREET_TYPE: 'ST', MAIL_MUN_NAME: 'TORONTO',
    MAIL_PROV_ABVN: 'ON', MAIL_POSTAL_CODE: postal, BF_REPPOINT_LATITUDE: '43', BF_REPPOINT_LONGITUDE: '-79' });
}

function snapshots() {
  const baseline: BaselineSnapshot = { vintage: '202606', province: 'ON', provinceComplete: true,
    completenessEvidence: 'complete synthetic baseline', records: [{ ...address('missing'), id: 1 }],
    legacyMappings: [], completedCities: [] };
  const source: StagedSource = { vintage: '202606', province: 'ON', provinceComplete: true,
    completenessEvidence: 'complete synthetic source', manifestHash: digest('source'),
    rawRows: 0, rejectedRows: 0, records: [] };
  return { baseline, source, identity: { mode: 'same-vintage' as const, evidence: 'synthetic identity review' }, partitions: ['M5V'] };
}

describe('review safeguards across planning and restart boundaries', () => {
  it.each(['source completeness', 'baseline completeness', 'source evidence', 'baseline evidence', 'rejected rows', 'unaccounted rows'])(
    'does not classify deletions or produce destructive previews with missing %s', (gap) => {
      const args = snapshots();
      if (gap === 'source completeness') args.source.provinceComplete = false;
      if (gap === 'baseline completeness') args.baseline.provinceComplete = false;
      if (gap === 'source evidence') args.source.completenessEvidence = '';
      if (gap === 'baseline evidence') args.baseline.completenessEvidence = '';
      if (gap === 'rejected rows') { args.source.rawRows = 1; args.source.rejectedRows = 1; }
      if (gap === 'unaccounted rows') args.source.rawRows = 1;
      const result = planNarDelta({ ...args, shrinkReview: 'Review cannot make incomplete inputs complete' });
      expect(result.counts).toMatchObject({ add: null, update: null, delete: null, unresolvedOld: 1 });
      expect(result.changes).toEqual([]);
      expect(result.aggregates).toEqual({ postal: [], city: [], street: [] });
      expect(result.provenance).toEqual([]);
      expect(result.coverage).toEqual([]);
      expect(result.estimate.addressIndexWritesUpperBound).toBeNull();
      expect(result.estimate.aggregateTableWritesUpperBound).toBeNull();
      expect(result.estimate.indexedRowsReadModel).toBeNull();
    }
  );

  it.each(['M5G', NO_POSTAL])('does not let a large stable FSA hide disappearing %s rows', (partition) => {
    const args = snapshots();
    const stable = Array.from({ length: 10 }, (_, index) => address(`stable-${index}`));
    const disappearing = address('disappearing', partition === NO_POSTAL ? '' : 'M5G2K6');
    args.baseline.records = [...stable, disappearing].map((row, index) => ({ ...row, id: index + 1 }));
    args.source.records = stable;
    args.source.rawRows = stable.length;
    args.partitions = ['M5V', partition];
    const result = planNarDelta(args);
    expect(result.counts.new).toBeGreaterThan(result.counts.old / 2);
    expect(result.blockers.some((message) => message.includes(partition) && /shrank|shrink|50%|coverage/i.test(message))).toBe(true);
  });
});

const temporary: Array<{ path: string; db: DatabaseSync }> = [];
afterEach(() => {
  for (const { path, db } of temporary.splice(0)) {
    db.close();
    rmSync(path, { recursive: true, force: true });
  }
});

describe('missing transport costs survive a process restart as a blocked checkpoint', () => {
  for (const phase of ['receipt', 'apply']) {
    it.each(['null', 'absent'])(`blocks ${phase} metadata that is %s before a restart can perform more work`, async (form) => {
      const path = mkdtempSync(join(tmpdir(), 'nar-review-'));
      const targetPath = join(path, 'target.sqlite');
      const db = new DatabaseSync(targetPath);
      temporary.push({ path, db });
      db.exec('CREATE TABLE effects(id TEXT PRIMARY KEY); CREATE TABLE receipts(id TEXT PRIMARY KEY);');
      let invalidMetadata = true, applies = 0, receipts = 0;
      // Runtime transport faults intentionally cross the otherwise typed adapter boundary.
      const invalid = () => JSON.parse(form === 'null' ? '{"value":null}' : '{}').value;
      const transport: LocalReceiptTransport = {
        kind: 'local-test', receiptUpperBound: { reads: 1, writes: 0 },
        async reconcile(batch) {
          receipts++;
          const applied = db.prepare('SELECT id FROM receipts WHERE id=?').get(batch.id);
          return { status: applied ? 'applied' : 'not-applied',
            cost: phase === 'receipt' && invalidMetadata ? invalid() : { reads: 1, writes: 0 } };
        },
        async applyAtomically(batch) {
          applies++;
          db.exec('BEGIN IMMEDIATE');
          try {
            db.prepare('INSERT INTO effects VALUES (?)').run(batch.id);
            db.prepare('INSERT INTO receipts VALUES (?)').run(batch.id);
            db.exec('COMMIT');
          } catch (error) { db.exec('ROLLBACK'); throw error; }
          return phase === 'apply' && invalidMetadata ? invalid() : { reads: 1, writes: 2 };
        },
      };
      const input = { targetPath, planId: digest('review-plan'),
        batches: [{ id: digest('review-batch'), payloadHash: digest('review-payload'), upperBound: { reads: 2, writes: 5 } }],
        ceilings: { reads: 50, writes: 50 }, maxAttempts: 2, transport };
      await expect(runLocalRehearsal(input)).rejects.toThrow();
      const checkpoint = JSON.parse(readFileSync(`${targetPath}.nar-checkpoint.json`, 'utf8'));
      expect(checkpoint.blocked).toMatch(/metadata|missing|calibrated/i);
      expect(checkpoint.complete).toBe(false);
      const callsBeforeRestart = { applies, receipts };
      invalidMetadata = false;
      await expect(runLocalRehearsal(input)).rejects.toThrow(/Checkpoint blocked/);
      expect({ applies, receipts }).toEqual(callsBeforeRestart);
      expect(db.prepare('SELECT COUNT(*) AS count FROM effects').get()?.count).toBe(phase === 'apply' ? 1 : 0);
    });
  }
});
