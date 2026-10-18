import { describe, expect, it, beforeEach } from 'vitest';

import {
  consumeRateWindow,
  consumeRateWindows,
  customerRateBucket,
  customerRateLimit,
  rateLimitIdentity,
  rateLimitKey,
  type RateWindow,
} from '../src/rate-limit';
import type { KeyAuthResult } from '../src/api-keys';
import type { Env } from '../src/types';
import { fakeUsageNamespace } from './helpers/fake-usage-do';
import { clearRateLimitStore } from '../src/utils';

function envWithUsage(): Env {
  return { API_KEY_USAGE: fakeUsageNamespace() } as unknown as Env;
}

function serverKeyAuth(id: string): KeyAuthResult {
  return {
    ok: true,
    key: { id, kind: 'server', customerId: 'c1', origins: [], dailyLimit: 0 },
  };
}

function browserKeyAuth(id: string): KeyAuthResult {
  return {
    ok: true,
    key: { id, kind: 'browser', customerId: 'c1', origins: ['https://acme.com'], dailyLimit: 10 },
  };
}

describe('rateLimitIdentity', () => {
  it('is the key for a server key', () => {
    expect(rateLimitIdentity(serverKeyAuth('sk_live_abc'))).toBe('key:sk_live_abc');
  });

  it('is null for a browser key, because a browser key is public', () => {
    // `pk_*` ships in page source and every visitor shares it. Keying a limit on it would give the
    // whole internet one bucket, and the first thirty requests a minute would exhaust it for
    // everybody — so a browser key falls back to the address, which is the control it has.
    expect(rateLimitIdentity(browserKeyAuth('pk_live_abc'))).toBeNull();
  });

  it('is null when nothing authenticated', () => {
    expect(rateLimitIdentity(null)).toBeNull();
    expect(rateLimitIdentity({ ok: false, reason: 'KEY_REQUIRED' })).toBeNull();
    expect(rateLimitIdentity({ ok: true })).toBeNull();
  });
});

describe('rateLimitKey', () => {
  it('uses the identity when there is one', () => {
    const request = new Request('https://lookup.test/api/federal', {
      headers: { 'CF-Connecting-IP': '203.0.113.1' },
    });
    expect(rateLimitKey('api', request, 'key:sk_live_abc')).toBe('api:key:sk_live_abc');
  });

  it('falls back to the address when there is not', () => {
    const request = new Request('https://lookup.test/api/federal', {
      headers: { 'CF-Connecting-IP': '203.0.113.1' },
    });
    expect(rateLimitKey('api', request, null)).toBe('api:ip:203.0.113.1');
  });
});

describe('consumeRateWindow', () => {
  beforeEach(() => {
    clearRateLimitStore();
  });

  it('allows up to the limit and refuses past it', async () => {
    const env = envWithUsage();
    const outcomes: boolean[] = [];
    for (let i = 0; i < 4; i++) {
      outcomes.push((await consumeRateWindow(env, 'api', 'api:key:sk_live_abc', 3)).allowed);
    }
    expect(outcomes).toEqual([true, true, true, false]);
  });

  it('shares one counter across callers, so rotating addresses does not mint a new allowance', async () => {
    // The bug this exists for. When the key was the address, an agent that changed address got a
    // fresh allowance with every change, so the limit did not constrain the actor it was aimed at.
    // Here two "different callers" present the same key and the second is refused.
    //
    // What this establishes in-process is that the counter is keyed by the rate-limit key and held
    // in the DO — which is the mechanism that makes it shared. That two *isolates* agree cannot be
    // shown from one process; it follows from `idFromName` being deterministic across the platform,
    // which is the platform's guarantee rather than something this test can witness.
    const env = envWithUsage();
    const first = await consumeRateWindow(env, 'api', 'api:key:sk_live_abc', 1);
    const second = await consumeRateWindow(env, 'api', 'api:key:sk_live_abc', 1);

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(false);
  });

  it('keeps separate buckets for the same identity', async () => {
    const env = envWithUsage();
    expect((await consumeRateWindow(env, 'api', 'api:key:sk_live_abc', 1)).allowed).toBe(true);
    // A different bucket is a different counter, so exhausting one does not exhaust the other.
    expect((await consumeRateWindow(env, 'mcp', 'mcp:key:sk_live_abc', 1)).allowed).toBe(true);
    expect((await consumeRateWindow(env, 'api', 'api:key:sk_live_abc', 1)).allowed).toBe(false);
  });

  it('falls back to the in-memory limiter when the binding is absent', async () => {
    // Local dev and most unit tests have no Durable Object. Falling back keeps them working, and
    // keeps the limit — a missing binding must not mean no limit at all.
    const env = {} as Env;
    const outcomes: boolean[] = [];
    for (let i = 0; i < 3; i++) {
      outcomes.push((await consumeRateWindow(env, 'api', 'api:key:sk_live_abc', 2)).allowed);
    }
    expect(outcomes).toEqual([true, true, false]);
  });

  it('does not limit when the limit is zero', async () => {
    const env = envWithUsage();
    for (let i = 0; i < 5; i++) {
      expect((await consumeRateWindow(env, 'api', 'api:key:sk_live_abc', 0)).allowed).toBe(true);
    }
  });
});

describe('the per-customer ceiling', () => {
  it('defaults to five times the per-key limit, and is overridable', () => {
    expect(customerRateLimit({} as Env, 100)).toBe(500);
    expect(customerRateLimit({ CUSTOMER_RATE_LIMIT: '250' } as unknown as Env, 100)).toBe(250);
    // A value that is not a positive number falls back rather than removing the ceiling — a typo in
    // an environment variable must not be the thing that disables the limit.
    expect(customerRateLimit({ CUSTOMER_RATE_LIMIT: 'lots' } as unknown as Env, 100)).toBe(500);
    expect(customerRateLimit({ CUSTOMER_RATE_LIMIT: '0' } as unknown as Env, 100)).toBe(500);
    expect(customerRateLimit({ CUSTOMER_RATE_LIMIT: '-5' } as unknown as Env, 100)).toBe(500);
  });

  it('bounds a customer that mints a second key', async () => {
    // Two keys, one account. Per-key limits alone would give this twice the rate; the ceiling is what
    // stops a second key buying another allowance. This is the property the per-key limit cannot
    // have, because minting a key is a UI click.
    const env = envWithUsage();
    const shard = customerRateBucket('c1');
    const windowsFor = (keyId: string): RateWindow[] => [
      { bucket: `api:key:${keyId}`, limit: 10 },
      { bucket: customerRateBucket('c1'), limit: 2 },
    ];

    // Awaited in order, deliberately: the point is the sequence, and concurrent calls would make the
    // counts depend on scheduling rather than on the ceiling.
    expect((await consumeRateWindows(env, shard, windowsFor('sk_a'))).allowed).toBe(true);
    expect((await consumeRateWindows(env, shard, windowsFor('sk_b'))).allowed).toBe(true);

    // The third request in total, on either key, is refused — and by the customer window, not the
    // key one, which has plenty left.
    const third = await consumeRateWindows(env, shard, windowsFor('sk_a'));
    expect(third.allowed).toBe(false);
    expect(third.refusedBy).toBe(customerRateBucket('c1'));
  });

  it('does not count a refused request against the windows that allowed', async () => {
    // All-or-nothing, matching the DO. Otherwise a caller already blocked on its ceiling would keep
    // inflating its per-key counter, and an operator reading that number would be reading one that
    // never happened.
    const env = envWithUsage();
    const shard = customerRateBucket('c1');
    const windows: RateWindow[] = [
      { bucket: 'api:key:sk_a', limit: 100 },
      { bucket: customerRateBucket('c1'), limit: 1 },
    ];

    expect((await consumeRateWindows(env, shard, windows)).allowed).toBe(true);
    expect((await consumeRateWindows(env, shard, windows)).allowed).toBe(false);

    // The key window saw exactly one request: had the refusal counted, the ceiling of 2 would already
    // have been reached and this would be false.
    const keyOnly = await consumeRateWindows(env, shard, [{ bucket: 'api:key:sk_a', limit: 2 }]);
    expect(keyOnly.allowed).toBe(true);
  });
});
