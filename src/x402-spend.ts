/**
 * Per-payer spend control for the account-free rail (security review item 4).
 *
 * The offer ceiling bounds each offer; nothing bounded the total a payer could spend across many.
 * This reserves spend against a per-payer daily cap *before* settlement, so a payer over its cap is
 * refused without any money moving.
 *
 * **What this bounds, and what it does not.** It bounds a runaway agent: one wallet in a retry loop
 * stops at the cap. It does not bound a determined actor, who can generate wallets freely — the cap
 * is a safety rail, not an identity control. That limitation is the honest reason the rail still
 * needs a treasury policy before it is enabled.
 *
 * Fail-closed: if the counter cannot be reached, the sale is refused. See `x402-spend-do.ts` for why
 * this differs from the per-key quota, which fails open.
 */

import { utcDay } from './time';
import { fromMicroUsd, toMicroUsd } from './x402-spend-do';
import type { Env } from './types';

/**
 * Conservative and tunable. Low enough that a runaway agent is stopped early; an operator can raise
 * it with `X402_PAYER_DAILY_CAP_USD` once there is a treasury policy to size it against.
 */
export const DEFAULT_X402_PAYER_DAILY_CAP_USD = 25;

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

export type SpendReservation =
  | { ok: true; spentUsd: number; capUsd: number }
  | { ok: false; reason: 'cap_exceeded' | 'counter_unavailable'; spentUsd: number; capUsd: number };

function stubFor(env: Env, payer: string) {
  // Lower-cased: one address must not get two counters because of checksum casing.
  return env.X402_SPEND!.get(env.X402_SPEND!.idFromName(`payer:${payer.toLowerCase()}`));
}

/**
 * Reserve `amountUsd` against the payer's daily cap. Returns `ok: false` when the cap would be
 * exceeded, or when the counter is unreachable (fail-closed).
 */
export async function reservePayerSpend(
  env: Env,
  payer: string,
  amountUsd: number,
  nowMs: number = Date.now()
): Promise<SpendReservation> {
  const capUsd = payerDailyCapUsd(env);
  if (capUsd <= 0) return { ok: true, spentUsd: 0, capUsd };
  if (!env.X402_SPEND) {
    // An unavailable counter must not mean unbounded spend.
    return { ok: false, reason: 'counter_unavailable', spentUsd: 0, capUsd };
  }

  try {
    const response = await stubFor(env, payer).fetch(
      `https://x402-spend/reserve?day=${utcDay(nowMs)}&amount=${toMicroUsd(amountUsd)}&cap=${toMicroUsd(capUsd)}`,
      { method: 'POST' }
    );
    const body = (await response.json()) as { allowed: boolean; spent: number; cap: number };
    return {
      ok: body.allowed,
      ...(body.allowed ? {} : { reason: 'cap_exceeded' as const }),
      spentUsd: fromMicroUsd(body.spent),
      capUsd: fromMicroUsd(body.cap),
    } as SpendReservation;
  } catch (error) {
    console.warn(`[X402] spend counter unavailable for ${payer}:`, error);
    return { ok: false, reason: 'counter_unavailable', spentUsd: 0, capUsd };
  }
}

/**
 * Give back a reservation that did not result in a payment. Never called when money moved or might
 * have (a pending settlement), and over-counting is the safe direction when this fails: the payer is
 * capped slightly early, never overspent.
 */
export async function releasePayerSpend(
  env: Env,
  payer: string,
  amountUsd: number,
  nowMs: number = Date.now()
): Promise<void> {
  if (!env.X402_SPEND || amountUsd <= 0) return;
  try {
    await stubFor(env, payer).fetch(
      `https://x402-spend/release?day=${utcDay(nowMs)}&amount=${toMicroUsd(amountUsd)}`,
      { method: 'POST' }
    );
  } catch (error) {
    console.warn(`[X402] failed to release reserved spend for ${payer}:`, error);
  }
}
