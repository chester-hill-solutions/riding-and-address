/**
 * Pure UTC calendar helpers shared by the daily key fuse and the monthly billing ledger.
 *
 * Kept free of storage imports so billing's locality is not contaminated by the Durable Object
 * module (architecture review 2026-09-15 / issue #85).
 */

/** UTC so the reset boundary does not move with the caller's timezone. */
export function utcDay(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

/** UTC calendar month `YYYY-MM`. */
export function utcMonth(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 7);
}
