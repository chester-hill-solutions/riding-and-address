import { describe, it, expect } from 'vitest';
import {
  DEFAULT_X402_PAYER_DAILY_CAP_USD,
  payerDailyCapUsd,
  releasePayerSpend,
  reservePayerSpend,
} from '../src/x402-spend';
import { fromMicroUsd, toMicroUsd } from '../src/x402-spend';
import { fakeUsageNamespace, newUsageDO } from './helpers/fake-usage-do';
import { createLookupTestEnv } from './helpers/lookup-test-env';
import type { Env } from '../src/types';

/**
 * The per-payer spend cap (security review item 4). The offer ceiling bounds each offer; this bounds
 * the total. The cases that matter are the ones where it must *refuse*: past the cap, and when the
 * counter cannot be reached at all — this control fails closed, unlike the per-key quota.
 */

const PAYER = '0xAbC0000000000000000000000000000000000001';

const envWith = (overrides: Partial<Env> = {}): Env =>
  ({
    ...createLookupTestEnv(),
    API_KEY_USAGE: fakeUsageNamespace(),
    X402_PAYER_DAILY_CAP_USD: '0.01',
    ...overrides,
  }) as unknown as Env;

describe('micro-USD conversion', () => {
  it('keeps a half-cent price, which cents would round to zero', () => {
    expect(toMicroUsd(0.005)).toBe(5000);
    expect(fromMicroUsd(5000)).toBe(0.005);
  });
});

describe('payerDailyCapUsd', () => {
  it('defaults conservatively when unset or unparseable', () => {
    expect(payerDailyCapUsd({} as Env)).toBe(DEFAULT_X402_PAYER_DAILY_CAP_USD);
    expect(payerDailyCapUsd({ X402_PAYER_DAILY_CAP_USD: 'not-a-number' } as Env)).toBe(
      DEFAULT_X402_PAYER_DAILY_CAP_USD
    );
  });

  it('honours a configured cap, including 0 to disable the control', () => {
    expect(payerDailyCapUsd({ X402_PAYER_DAILY_CAP_USD: '5' } as Env)).toBe(5);
    expect(payerDailyCapUsd({ X402_PAYER_DAILY_CAP_USD: '0' } as Env)).toBe(0);
  });
});

describe('reservePayerSpend', () => {
  it('accumulates spend and refuses past the cap', async () => {
    const env = envWith();
    // Cap 0.01 = two 0.005 reservations.
    expect((await reservePayerSpend(env, PAYER, 0.005)).ok).toBe(true);
    expect((await reservePayerSpend(env, PAYER, 0.005)).ok).toBe(true);

    const third = await reservePayerSpend(env, PAYER, 0.005);
    expect(third.ok).toBe(false);
    if (!third.ok) expect(third.reason).toBe('cap_exceeded');
  });

  it('keeps payers independent', async () => {
    const env = envWith();
    await reservePayerSpend(env, PAYER, 0.005);
    await reservePayerSpend(env, PAYER, 0.005);
    // A different wallet has its own counter and is unaffected.
    expect((await reservePayerSpend(env, '0xother', 0.005)).ok).toBe(true);
  });

  it('treats one address as one payer regardless of casing', async () => {
    const env = envWith();
    await reservePayerSpend(env, PAYER, 0.005);
    await reservePayerSpend(env, PAYER.toUpperCase(), 0.005);
    const third = await reservePayerSpend(env, PAYER.toLowerCase(), 0.005);
    expect(third.ok).toBe(false);
  });

  it('refuses when the counter is unbound, rather than spending blind', async () => {
    const result = await reservePayerSpend(envWith({ API_KEY_USAGE: undefined }), PAYER, 0.005);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('counter_unavailable');
  });

  it('skips the control entirely when the cap is 0', async () => {
    const env = envWith({ X402_PAYER_DAILY_CAP_USD: '0', API_KEY_USAGE: undefined });
    expect((await reservePayerSpend(env, PAYER, 999)).ok).toBe(true);
  });

  it('refuses an unidentified payer while the cap is enabled (#158)', async () => {
    // A cap that cannot name the payer is not a cap. Skipping the reservation here would leave the
    // cap unenforced for exactly the payload shapes the extractor does not recognise.
    for (const payer of [null, undefined, '']) {
      const result = await reservePayerSpend(envWith(), payer, 0.005);
      expect(result.ok, String(payer)).toBe(false);
      if (!result.ok) expect(result.reason).toBe('payer_unidentified');
    }
  });

  it('does not require a payer when the cap is explicitly disabled', async () => {
    const env = envWith({ X402_PAYER_DAILY_CAP_USD: '0' });
    expect((await reservePayerSpend(env, null, 0.005)).ok).toBe(true);
  });
});

describe('releasePayerSpend', () => {
  it('gives a reservation back when no money moved', async () => {
    const env = envWith();
    await reservePayerSpend(env, PAYER, 0.005);
    const second = await reservePayerSpend(env, PAYER, 0.005);
    if (!second.ok) throw new Error('expected a reservation');
    await releasePayerSpend(env, second.handle);
    // One unit is free again.
    expect((await reservePayerSpend(env, PAYER, 0.005)).ok).toBe(true);
  });

  it("releases against the reservation's own day, not today (#157)", async () => {
    const env = envWith({ X402_PAYER_DAILY_CAP_USD: '0.005' });
    const beforeMidnight = Date.parse('2026-10-17T23:59:00Z');
    const afterMidnight = Date.parse('2026-10-18T00:01:00Z');

    const old = await reservePayerSpend(env, PAYER, 0.005, beforeMidnight);
    if (!old.ok) throw new Error('expected a reservation');
    // A same-payer payment succeeds on the new day.
    expect((await reservePayerSpend(env, PAYER, 0.005, afterMidnight)).ok).toBe(true);

    // Releasing the old reservation must not touch the new day's spending. Recomputing "today" here
    // would subtract from the 18th and let the payer overspend it.
    await releasePayerSpend(env, old.handle);

    expect((await reservePayerSpend(env, PAYER, 0.005, afterMidnight)).ok).toBe(false);
  });

  it('never goes negative', async () => {
    const env = envWith();
    const reservation = await reservePayerSpend(env, PAYER, 0.005);
    if (!reservation.ok) throw new Error('expected a reservation');
    await releasePayerSpend(env, reservation.handle);
    await releasePayerSpend(env, reservation.handle);
    expect((await reservePayerSpend(env, PAYER, 0.01)).ok).toBe(true);
  });

  it('is a no-op without a binding, so it cannot fail the request that called it', async () => {
    const env = envWith();
    const reservation = await reservePayerSpend(env, PAYER, 0.005);
    if (!reservation.ok) throw new Error('expected a reservation');
    await expect(
      releasePayerSpend(envWith({ API_KEY_USAGE: undefined }), reservation.handle)
    ).resolves.toBeUndefined();
  });
});

describe('the spend counter in ApiKeyUsageDO', () => {
  it('does not increment a refused reservation', async () => {
    const instance = newUsageDO();
    const call = (path: string) => instance.fetch(new Request(`https://usage/spend${path}`, { method: 'POST' }));

    await call('/reserve?day=2026-10-17&amount=5000&cap=10000');
    await call('/reserve?day=2026-10-17&amount=5000&cap=10000');
    const refused = await (await call('/reserve?day=2026-10-17&amount=5000&cap=10000')).json() as {
      allowed: boolean; spent: number;
    };
    expect(refused.allowed).toBe(false);
    // The refused request must not inflate the counter the operator reads.
    expect(refused.spent).toBe(10000);
  });

  it('counts each UTC day separately', async () => {
    const instance = newUsageDO();
    const call = (path: string) => instance.fetch(new Request(`https://usage/spend${path}`, { method: 'POST' }));
    await call('/reserve?day=2026-10-17&amount=10000&cap=10000');
    expect((await (await call('/reserve?day=2026-10-18&amount=10000&cap=10000')).json() as { allowed: boolean }).allowed).toBe(true);
  });
});
