import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { digest } from '../../src/nar-delta';

export interface Cost { reads: number; writes: number }
export interface RehearsalBatch { id: string; payloadHash: string; upperBound: Cost }
export interface LocalReceiptTransport {
  /** This interface is exercised only by local tests. It is not a production D1 adapter. */
  kind: 'local-test';
  receiptUpperBound: Cost;
  reconcile(batch: RehearsalBatch): Promise<{ status: 'applied' | 'not-applied' | 'unknown'; cost: Cost }>;
  /** Must commit effects and payload-hash receipt in one transaction, or neither. */
  applyAtomically(batch: RehearsalBatch): Promise<Cost>;
}
interface Checkpoint {
  schema: 1;
  planId: string;
  batchHash: string;
  ceilings: Cost;
  reserved: Cost;
  reservations: Array<{ batchId: string; phase: 'receipt' | 'apply'; cost: Cost }>;
  batches: Record<string, { attempts: number; done: boolean }>;
  blocked: string | null;
  complete: boolean;
}

function validCost(cost: unknown): cost is Cost {
  if (!cost || typeof cost !== 'object') return false;
  const { reads, writes } = cost as Partial<Cost>;
  return typeof reads === 'number' && Number.isSafeInteger(reads) && reads >= 0 &&
    typeof writes === 'number' && Number.isSafeInteger(writes) && writes >= 0;
}

/** Atomic replacement + durable file/parent flush, including reservations before a possible mutation. */
function save(path: string, value: Checkpoint): void {
  const temp = `${path}.${process.pid}.tmp`;
  const fd = openSync(temp, 'wx', 0o600);
  try { writeFileSync(fd, JSON.stringify(value)); fsyncSync(fd); }
  finally { closeSync(fd); }
  renameSync(temp, path);
  const directory = openSync(dirname(path), 'r');
  try { fsyncSync(directory); }
  finally { closeSync(directory); }
}

/**
 * One local writer per canonical target file, independent of caller CWD/output directory.
 * Never steals a stale-looking lock. A crash requires operator reconciliation, not PID guessing.
 * A future production adapter additionally requires an atomic distributed fencing contract.
 */
export function acquireLocalWriter(targetPath: string): () => void {
  const target = realpathSync(targetPath);
  const lock = `${target}.nar-writer-lock`;
  mkdirSync(lock);
  writeFileSync(`${lock}/owner.json`, JSON.stringify({ pid: process.pid, target }), { flag: 'wx', mode: 0o600 });
  let released = false;
  return () => { if (!released) { rmSync(lock, { recursive: true }); released = true; } };
}

/**
 * Rehearse cost reservations, stable checkpoints, and ambiguous acknowledgements locally.
 * Costs are supplied by a calibrated local test adapter. Never interpret them as measured D1 costs.
 * Reservations are spent, never refunded, even when a response is lost or a batch was a no-op.
 */
export async function runLocalRehearsal(input: {
  targetPath: string; planId: string; batches: RehearsalBatch[];
  ceilings: Cost; maxAttempts: number; transport: LocalReceiptTransport;
}): Promise<Checkpoint> {
  const { planId, batches, ceilings, maxAttempts, transport } = input;
  if (transport.kind !== 'local-test' || !planId || !validCost(ceilings) ||
      !validCost(transport.receiptUpperBound) || !Number.isSafeInteger(maxAttempts) || maxAttempts < 1) {
    throw new Error('Invalid local rehearsal bounds/adapter');
  }
  const ids = new Set<string>();
  for (const batch of batches) {
    if (!/^[a-f0-9]{64}$/.test(batch.id) || !/^[a-f0-9]{64}$/.test(batch.payloadHash) || ids.has(batch.id) || !validCost(batch.upperBound)) {
      throw new Error('Invalid/duplicate stable batch identity or unbounded cost');
    }
    ids.add(batch.id);
  }
  const target = realpathSync(input.targetPath);
  const release = acquireLocalWriter(target);
  const path = `${target}.nar-checkpoint.json`;
  try {
    const batchHash = digest({ batches, maxAttempts, receiptUpperBound: transport.receiptUpperBound });
    const state: Checkpoint = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) as Checkpoint : {
      schema: 1, planId, batchHash, ceilings, reserved: { reads: 0, writes: 0 }, reservations: [],
      batches: Object.fromEntries(batches.map((b) => [b.id, { attempts: 0, done: false }])), blocked: null, complete: false,
    };
    if (state.schema !== 1 || state.planId !== planId || state.batchHash !== batchHash ||
        digest(state.ceilings) !== digest(ceilings) || !validCost(state.reserved) ||
        state.reserved.reads > ceilings.reads || state.reserved.writes > ceilings.writes) {
      throw new Error('Checkpoint does not match immutable plan/bounds; refusing resume');
    }
    if (state.blocked) throw new Error(`Checkpoint blocked: ${state.blocked}`);
    // Verify accounting before trusting a resumed local journal.
    const recorded = state.reservations.reduce((sum, r) => {
      if (!validCost(r.cost) || !ids.has(r.batchId)) throw new Error('Corrupt reservation');
      return { reads: sum.reads + r.cost.reads, writes: sum.writes + r.cost.writes };
    }, { reads: 0, writes: 0 });
    if (digest(recorded) !== digest(state.reserved) || Object.keys(state.batches).length !== batches.length ||
        batches.some((b) => !state.batches[b.id] || !Number.isSafeInteger(state.batches[b.id].attempts) ||
          state.batches[b.id].attempts < 0 || state.batches[b.id].attempts > maxAttempts)) {
      throw new Error('Corrupt checkpoint accounting');
    }
    const reserve = (batch: RehearsalBatch, phase: 'receipt' | 'apply', cost: Cost) => {
      if (state.reserved.reads + cost.reads > ceilings.reads || state.reserved.writes + cost.writes > ceilings.writes) {
        throw new Error(`Ceiling reached before ${phase}; no request sent`);
      }
      state.reserved.reads += cost.reads;
      state.reserved.writes += cost.writes;
      state.reservations.push({ batchId: batch.id, phase, cost: { ...cost } });
      if (phase === 'apply') state.batches[batch.id].attempts++;
      save(path, state);
    };
    const checkActual = (actual: unknown, upper: Cost) => {
      if (!validCost(actual) || actual.reads > upper.reads || actual.writes > upper.writes) {
        state.blocked = 'Actual metadata exceeds calibrated reservation or is missing';
        save(path, state);
        throw new Error(state.blocked);
      }
    };
    save(path, state);
    for (const batch of batches) {
      const checkpoint = state.batches[batch.id];
      if (checkpoint.done) continue;
      for (;;) {
        reserve(batch, 'receipt', transport.receiptUpperBound);
        const receipt = await transport.reconcile(batch);
        checkActual(receipt?.cost, transport.receiptUpperBound);
        if (receipt.status === 'applied') { checkpoint.done = true; save(path, state); break; }
        if (receipt.status !== 'not-applied') throw new Error('Ambiguous receipt; stop without replay or completion');
        if (checkpoint.attempts >= maxAttempts) throw new Error('Persisted attempt limit reached');
        reserve(batch, 'apply', batch.upperBound);
        let actual: Cost;
        try { actual = await transport.applyAtomically(batch); }
        catch {
          // A timeout is never proof of rollback. Reconcile the SAME stable batch before replay.
          // The next receipt read and any next attempt need their own persisted reservations.
          continue;
        }
        checkActual(actual, batch.upperBound);
        checkpoint.done = true;
        save(path, state);
        break;
      }
    }
    state.complete = batches.every((batch) => state.batches[batch.id].done);
    save(path, state);
    return state;
  } finally { release(); }
}
