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

/**
 * UTC minute `YYYY-MM-DDTHH:mm`, the window key for the shared rate limiter.
 *
 * A fixed window aligned to the clock rather than to each client's first request. The window is
 * shared — one instance of it per identity, in a Durable Object — so it has to be the same window
 * for every isolate serving that identity; a per-client start time could not be.
 *
 * The cost of a fixed window is that a caller can send the full allowance at the end of one minute
 * and again at the start of the next. That is a known property, not an oversight: it is what the
 * previous per-isolate limiter did too, and burst handling is a separate change.
 */
export function utcMinute(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 16);
}
