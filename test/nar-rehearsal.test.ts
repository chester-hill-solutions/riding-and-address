import { afterEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acquireLocalWriter, runLocalRehearsal, type LocalReceiptTransport, type RehearsalBatch } from '../scripts/lib/nar-rehearsal';
import { digest } from '../src/nar-delta';

const dirs: string[] = [];
afterEach(() => { for (const path of dirs.splice(0)) rmSync(path, { recursive: true, force: true }); });

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'nar-rehearsal-')); dirs.push(dir);
  const targetPath = join(dir, 'rehearsal.sqlite');
  const db = new DatabaseSync(targetPath);
  db.exec('CREATE TABLE effects(id TEXT PRIMARY KEY); CREATE TABLE receipts(id TEXT PRIMARY KEY, payload_hash TEXT NOT NULL);');
  let applies = 0, lostAck = false, rollback = false, unknown = false, overrun = false;
  let inspectedReservation = false;
  const transport: LocalReceiptTransport = {
    kind: 'local-test', receiptUpperBound: { reads: 1, writes: 0 },
    async reconcile(batch) {
      if (unknown) { unknown = false; return { status: 'unknown', cost: { reads: 1, writes: 0 } }; }
      const receipt = db.prepare('SELECT payload_hash FROM receipts WHERE id=?').get(batch.id);
      if (receipt && receipt.payload_hash !== batch.payloadHash) throw new Error('Receipt payload mismatch');
      return { status: receipt ? 'applied' : 'not-applied', cost: { reads: 1, writes: 0 } };
    },
    async applyAtomically(batch) {
      applies++;
      // The checkpoint is already durable when the adapter is first allowed to mutate anything.
      const journal = JSON.parse(readFileSync(`${targetPath}.nar-checkpoint.json`, 'utf8'));
      inspectedReservation = journal.reservations.at(-1).phase === 'apply' && journal.reserved.writes >= batch.upperBound.writes;
      db.exec('BEGIN IMMEDIATE');
      try {
        const prior = db.prepare('SELECT payload_hash FROM receipts WHERE id=?').get(batch.id);
        if (prior && prior.payload_hash !== batch.payloadHash) throw new Error('Receipt payload mismatch');
        if (!prior) {
          db.prepare('INSERT INTO effects VALUES(?)').run(batch.id);
          db.prepare('INSERT INTO receipts VALUES(?,?)').run(batch.id, batch.payloadHash);
        }
        if (rollback) { rollback = false; throw new Error('Simulated precommit interruption'); }
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
      if (lostAck) { lostAck = false; throw new Error('Simulated lost acknowledgement after commit'); }
      return { reads: 1, writes: overrun ? 100 : 2 };
    },
  };
  const batches: RehearsalBatch[] = [{ id: digest('batch-1'), payloadHash: digest('payload-1'), upperBound: { reads: 2, writes: 5 } }];
  return { db, targetPath, transport, batches,
    run: (ceilings = { reads: 20, writes: 20 }, selected = batches, maxAttempts = 2) => runLocalRehearsal({ targetPath, transport, batches: selected, planId: digest('plan'), ceilings, maxAttempts }),
    applies: () => applies, inspected: () => inspectedReservation,
    loseAck: () => { lostAck = true; }, rollback: () => { rollback = true; },
    unknown: () => { unknown = true; }, overrun: () => { overrun = true; } };
}

describe('local reservation and crash rehearsal (not a D1 transport)', () => {
  it('reserves worst-case credits before effects and never refunds optimistic actual usage', async () => {
    const f = fixture();
    const state = await f.run();
    expect(f.inspected()).toBe(true);
    expect(state.reserved).toEqual({ reads: 3, writes: 5 });
    expect(state.complete).toBe(true);
    expect(f.db.prepare('SELECT COUNT(*) AS n FROM effects').get()?.n).toBe(1);
    f.db.close();
  });

  it('stops before sending a mutation when either read or write ceiling cannot cover it', async () => {
    for (const ceiling of [{ reads: 20, writes: 4 }, { reads: 2, writes: 20 }]) {
      const f = fixture();
      await expect(f.run(ceiling)).rejects.toThrow(/Ceiling reached before apply/);
      expect(f.applies()).toBe(0);
      const state = JSON.parse(readFileSync(`${f.targetPath}.nar-checkpoint.json`, 'utf8'));
      expect(state.complete).toBe(false);
      f.db.close();
    }
  });

  it('reconciles a committed lost acknowledgement rather than replaying effects', async () => {
    const f = fixture(); f.loseAck();
    const state = await f.run();
    expect(f.applies()).toBe(1);
    expect(state.reserved).toEqual({ reads: 4, writes: 5 });
    expect(state.complete).toBe(true);
    expect(state.batches[f.batches[0].id].attempts).toBe(1);
    f.db.close();
  });

  it('retries a proven rollback with the same ID, reserving full costs again', async () => {
    const f = fixture(); f.rollback();
    const state = await f.run();
    expect(f.applies()).toBe(2);
    expect(state.reserved).toEqual({ reads: 6, writes: 10 });
    expect(f.db.prepare('SELECT COUNT(*) AS n FROM effects').get()?.n).toBe(1);
    expect(f.db.prepare('SELECT COUNT(*) AS n FROM receipts').get()?.n).toBe(1);
    f.db.close();
  });

  it('stops on an unknown receipt and resumes against immutable plan inputs', async () => {
    const f = fixture(); f.unknown();
    await expect(f.run()).rejects.toThrow(/Ambiguous receipt/);
    expect(f.applies()).toBe(0);
    const state = await f.run();
    expect(state.complete).toBe(true);
    expect(state.reserved).toEqual({ reads: 4, writes: 5 });
    await expect(f.run({ reads: 30, writes: 30 })).rejects.toThrow(/immutable plan/);
    const changed = [{ ...f.batches[0], payloadHash: digest('changed') }];
    await expect(f.run({ reads: 20, writes: 20 }, changed)).rejects.toThrow(/immutable plan/);
    f.db.close();
  });

  it('does not repeat acknowledged address work when later derived work is interrupted', async () => {
    const f = fixture();
    const second = { id: digest('derived-batch'), payloadHash: digest('derived-payload'), upperBound: { reads: 2, writes: 5 } };
    const batches = [...f.batches, second];
    const original = f.transport.reconcile;
    let failDerivedOnce = true;
    f.transport.reconcile = async (batch) => {
      if (batch.id === second.id && failDerivedOnce) { failDerivedOnce = false; return { status: 'unknown', cost: { reads: 1, writes: 0 } }; }
      return original(batch);
    };
    await expect(f.run({ reads: 20, writes: 20 }, batches)).rejects.toThrow(/Ambiguous receipt/);
    const partial = JSON.parse(readFileSync(`${f.targetPath}.nar-checkpoint.json`, 'utf8'));
    expect(partial.complete).toBe(false);
    expect(partial.batches[f.batches[0].id].done).toBe(true);
    expect(partial.batches[second.id].done).toBe(false);
    const complete = await f.run({ reads: 20, writes: 20 }, batches);
    expect(complete.complete).toBe(true);
    expect(f.applies()).toBe(2);
    f.db.close();
  });

  it('persists attempt exhaustion across restarts', async () => {
    const f = fixture(); f.rollback();
    await expect(f.run({ reads: 20, writes: 20 }, f.batches, 1)).rejects.toThrow(/Persisted attempt limit/);
    await expect(f.run({ reads: 20, writes: 20 }, f.batches, 1)).rejects.toThrow(/Persisted attempt limit/);
    expect(f.applies()).toBe(1);
    f.db.close();
  });

  it('blocks permanently on metadata overruns instead of silently refunding or retrying', async () => {
    const f = fixture(); f.overrun();
    await expect(f.run()).rejects.toThrow(/exceeds calibrated reservation/);
    await expect(f.run()).rejects.toThrow(/Checkpoint blocked/);
    expect(f.applies()).toBe(1);
    f.db.close();
  });

  it('uses an atomic lock on the canonical target even through a symlink', () => {
    const f = fixture();
    const alias = `${f.targetPath}.alias`; symlinkSync(f.targetPath, alias);
    const release = acquireLocalWriter(f.targetPath);
    expect(() => acquireLocalWriter(alias)).toThrow();
    release();
    acquireLocalWriter(alias)();
    f.db.close();
  });

  it('refuses a corrupt checkpoint and duplicate stable batch IDs', async () => {
    const f = fixture();
    await expect(f.run({ reads: 20, writes: 20 }, [...f.batches, ...f.batches])).rejects.toThrow(/duplicate/);
    await f.run();
    const path = `${f.targetPath}.nar-checkpoint.json`;
    const state = JSON.parse(readFileSync(path, 'utf8')); state.reserved.writes = 0;
    writeFileSync(path, JSON.stringify(state));
    await expect(f.run()).rejects.toThrow(/Corrupt checkpoint/);
    f.db.close();
  });
});
