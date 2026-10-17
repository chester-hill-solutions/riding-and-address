/**
 * Per-payer spend control for the account-free rail (security review item 4).
 *
 * The offer ceiling bounds each offer; nothing bounded the total a payer could spend across many.
 * This reserves spend against a per-payer daily cap *before* settlement, so a payer over its cap is
 * refused without any money moving.
 *
 * The counter lives in the existing `ApiKeyUsageDO` rather than a new Durable Object, because a new
 * DO class needs a migration and this Worker is deployed through Cloudflare's versioned pipeline,
 * which cannot apply one (`10211`). The DO is a per-entity daily counter, which is exactly the shape
 * needed; only the units differ. The *failure direction* differs by caller and stays here: the key
 * quota fails open, this fails closed.
 *
 * Three properties this module is careful about, each of which was a defect when it was missing:
 *
 *   1. **A cap that cannot name the payer is not a cap.** When the cap is enabled and the payload
 *      names no payer this refuses, rather than settling unmetered (#158).
 *   2. **Release targets the reservation's own UTC day.** A reservation made before midnight and
 *      released after it must not subtract from the new day's spending (#157).
 *   3. **Only positive terminal evidence of non-payment releases.** An ambiguous settlement error
 *      keeps the reservation, because the money may have moved (#156).
 *
 * **What this bounds, and what it does not.** It bounds a runaway agent: one wallet in a retry loop
 * stops at the cap. It does not bound a determined actor, who can generate wallets freely — the cap
 * is a safety rail, not an identity control. That limitation is the honest reason the rail still
 * needs a treasury policy before it is enabled.
 */

import { utcDay } from './time';
import type { Env } from './types';

/**
 * Conservative and tunable. Low enough that a runaway agent is stopped early; an operator can raise
 * it with `X402_PAYER_DAILY_CAP_USD` once there is a treasury policy to size it against.
 */
export const DEFAULT_X402_PAYER_DAILY_CAP_USD = 25;

/** Micro-USD, the unit the counter stores. Half a cent is 5000, which cents could not express. */
const MICRO_USD = 1_000_000;

export function toMicroUsd(usd: number): number {
  return Math.round(usd * MICRO_USD);
}

export function fromMicroUsd(micro: number): number {
  return micro / MICRO_USD;
}

/**
 * What a reservation gives back, so a release cannot go to the wrong bucket or the wrong payer.
 * Carrying the day is the point: recomputing "today" at release time is wrong across midnight.
 */
export interface SpendReservationHandle {
  payer: string;
  /** The UTC day the reservation was made in. Release must target this bucket. */
  day: string;
  amountUsd: number;
}

export type SpendReservation =
  | { ok: true; spentUsd: number; capUsd: number; handle: SpendReservationHandle }
  | {
      ok: false;
      reason: 'cap_exceeded' | 'counter_unavailable' | 'payer_unidentified';
      spentUsd: number;
      capUsd: number;
    };

/** The cap in USD. `0` disables the control (the rail then relies on the offer ceiling alone). */
export function payerDailyCapUsd(env: Env): number {
  const raw = env.X402_PAYER_DAILY_CAP_USD;
  // An unset or unreadable cap must not silently disable the control — only an explicit `0` does.
  // (`Number('')` is 0, so the empty string has to be handled before parsing.)
  if (raw === undefined || raw.trim() === '') return DEFAULT_X402_PAYER_DAILY_CAP_USD;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_X402_PAYER_DAILY_CAP_USD;
  return parsed;
}

function stubFor(env: Env, payer: string) {
  // Lower-cased: one address must not get two counters because of checksum casing. The `payer:`
  // prefix keeps a wallet address from ever colliding with an API key id in the same DO.
  return env.API_KEY_USAGE!.get(env.API_KEY_USAGE!.idFromName(`payer:${payer.toLowerCase()}`));
}

/**
 * Reserve `amountUsd` against the payer's daily cap.
 *
 * Returns `ok: false` when the cap would be exceeded, when the counter is unreachable (fail-closed),
 * or when the cap is enabled and no payer was identified (also fail-closed — an unattributable
 * payment cannot be metered, so it must not settle).
 */
export async function reservePayerSpend(
  env: Env,
  payer: string | null | undefined,
  amountUsd: number,
  nowMs: number = Date.now()
): Promise<SpendReservation> {
  const capUsd = payerDailyCapUsd(env);
  const day = utcDay(nowMs);

  // An explicit `0` disables the control entirely, the payer requirement included. That is the only
  // way to run without a cap, and it has to be asked for.
  if (capUsd <= 0) {
    return { ok: true, spentUsd: 0, capUsd, handle: { payer: payer ?? '', day, amountUsd: 0 } };
  }

  if (!payer) {
    return { ok: false, reason: 'payer_unidentified', spentUsd: 0, capUsd };
  }
  if (!env.API_KEY_USAGE) {
    // An unavailable counter must not mean unbounded spend.
    return { ok: false, reason: 'counter_unavailable', spentUsd: 0, capUsd };
  }

  try {
    const response = await stubFor(env, payer).fetch(
      `https://usage/spend/reserve?day=${day}&amount=${toMicroUsd(amountUsd)}&cap=${toMicroUsd(capUsd)}`,
      { method: 'POST' }
    );
    const body = (await response.json()) as { allowed: boolean; spent: number; cap: number };
    const spentUsd = fromMicroUsd(body.spent);
    const actualCapUsd = fromMicroUsd(body.cap);
    return body.allowed
      ? { ok: true, spentUsd, capUsd: actualCapUsd, handle: { payer, day, amountUsd } }
      : { ok: false, reason: 'cap_exceeded', spentUsd, capUsd: actualCapUsd };
  } catch (error) {
    console.warn(`[X402] spend counter unavailable for ${payer}:`, error);
    return { ok: false, reason: 'counter_unavailable', spentUsd: 0, capUsd };
  }
}

/**
 * Give back a reservation, against the bucket it was taken from.
 *
 * Call this **only** on positive terminal evidence that no money moved. An ambiguous settlement
 * error is not that evidence, and over-counting is the safe direction when this is wrong or fails:
 * the payer is capped slightly early, never overspent.
 */
export async function releasePayerSpend(env: Env, handle: SpendReservationHandle): Promise<void> {
  if (!env.API_KEY_USAGE || handle.amountUsd <= 0) return;
  try {
    await stubFor(env, handle.payer).fetch(
      `https://usage/spend/release?day=${handle.day}&amount=${toMicroUsd(handle.amountUsd)}`,
      { method: 'POST' }
    );
  } catch (error) {
    console.warn(`[X402] failed to release reserved spend for ${handle.payer}:`, error);
  }
}
