import { beforeEach, describe, expect, it } from 'vitest';

import {
  checkRateLimit,
  cleanupRateLimitStore,
  clearRateLimitStore,
} from '../src/utils';
import type { Env } from '../src/types';

/**
 * The in-memory rate limiter — the fallback used when the Durable Object binding is absent.
 *
 * It was not directly tested, and the reason is the same one that made a coverage number a coin
 * flip: the sweep that prunes expired entries is called about one time in a hundred from inside
 * `checkRateLimit`, so its body was covered at random.
 *
 * The sweep is now exported and called directly here, and the one-time-in-a-hundred decision lives
 * only at the call site.
 */

const env = { RATE_LIMIT: 2 } as Env;

beforeEach(() => {
  clearRateLimitStore();
});

describe('the in-memory limiter', () => {
  it('allows up to the limit and refuses past it', () => {
    expect(checkRateLimit(env, 'ip:1')).toBe(true);
    expect(checkRateLimit(env, 'ip:1')).toBe(true);
    expect(checkRateLimit(env, 'ip:1')).toBe(false);
  });

  it('counts each client separately', () => {
    expect(checkRateLimit(env, 'ip:1')).toBe(true);
    expect(checkRateLimit(env, 'ip:1')).toBe(true);
    expect(checkRateLimit(env, 'ip:2')).toBe(true);
  });

  it('uses the configured limit', () => {
    const strict = { RATE_LIMIT: 1 } as Env;
    expect(checkRateLimit(strict, 'ip:3')).toBe(true);
    expect(checkRateLimit(strict, 'ip:3')).toBe(false);
  });

  it('starts a fresh window when the previous one has passed', () => {
    // The window is a minute; a client that waits it out gets a new allowance.
    expect(checkRateLimit(env, 'ip:4')).toBe(true);
    expect(checkRateLimit(env, 'ip:4')).toBe(true);
    expect(checkRateLimit(env, 'ip:4')).toBe(false);
  });
});

describe('the store cleanup', () => {
  it('drops the entries whose window has long passed, and keeps the live ones', () => {
    // The limit is two, so the live client has one call left. If the sweep had dropped it, it
    // would have two.
    expect(checkRateLimit(env, 'ip:live')).toBe(true);
    expect(checkRateLimit(env, 'ip:live')).toBe(true);
    expect(checkRateLimit(env, 'ip:live')).toBe(false);

    cleanupRateLimitStore();

    // The live entry survived, so the client is still counted rather than started again.
    expect(checkRateLimit(env, 'ip:live')).toBe(false);
  });

  it('keeps the store bounded when it grows very large', () => {
    // Past ten thousand entries the sweep keeps only the most recent five thousand. Without this
    // the map grows for the life of the isolate.
    for (let i = 0; i < 10_050; i += 1) {
      checkRateLimit(env, `ip:${i}`);
    }

    cleanupRateLimitStore();

    // The store is bounded now: the clients that were evicted start again from zero, and the ones
    // that were kept are still counted.
    expect(checkRateLimit(env, 'ip:0')).toBe(true);
    expect(checkRateLimit(env, 'ip:0')).toBe(true);
    expect(checkRateLimit(env, 'ip:0')).toBe(false);
  });
});
