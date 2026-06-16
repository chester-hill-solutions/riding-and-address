import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LRUCache } from '../src/cache';

describe('LRUCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stores and retrieves values', () => {
    const cache = new LRUCache<string, number>(3, 10000);
    cache.set('a', 1);
    expect(cache.get('a')).toBe(1);
    expect(cache.has('a')).toBe(true);
  });

  it('returns undefined for missing keys', () => {
    const cache = new LRUCache<string, number>(3, 10000);
    expect(cache.get('missing')).toBeUndefined();
    expect(cache.has('missing')).toBe(false);
  });

  it('evicts least recently used when over capacity', () => {
    const cache = new LRUCache<string, number>(2, 10000);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);
  });

  it('updates access order on get', () => {
    const cache = new LRUCache<string, number>(2, 10000);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.get('a'); // a is now most recently used
    cache.set('c', 3);
    expect(cache.get('a')).toBe(1); // a should still be here
    expect(cache.get('b')).toBeUndefined(); // b was LRU
  });

  it('deletes entries', () => {
    const cache = new LRUCache<string, number>(3, 10000);
    cache.set('a', 1);
    expect(cache.delete('a')).toBe(true);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.delete('a')).toBe(false);
  });

  it('clears all entries', () => {
    const cache = new LRUCache<string, number>(3, 10000);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.clear();
    expect(cache.size()).toBe(0);
    expect(cache.get('a')).toBeUndefined();
  });

  it('removes expired entries on get', () => {
    const cache = new LRUCache<string, number>(3, 100);
    cache.set('a', 1);
    vi.advanceTimersByTime(150);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.size()).toBe(0);
  });

  it('removes expired entries on has', () => {
    const cache = new LRUCache<string, number>(3, 100);
    cache.set('a', 1);
    vi.advanceTimersByTime(150);
    expect(cache.has('a')).toBe(false);
    expect(cache.size()).toBe(0);
  });

  it('removes expired entries via cleanupExpired', () => {
    const cache = new LRUCache<string, number>(3, 100);
    cache.set('a', 1);
    cache.set('b', 2);
    vi.advanceTimersByTime(50);
    cache.set('c', 3);
    vi.advanceTimersByTime(60);
    const removed = cache.cleanupExpired();
    expect(removed).toBe(2);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('c')).toBe(3);
  });

  it('evicts expired entries before LRU when at capacity', () => {
    const cache = new LRUCache<string, number>(2, 100);
    cache.set('a', 1);
    vi.advanceTimersByTime(50);
    cache.set('b', 2);
    vi.advanceTimersByTime(60);
    // a is now expired, b is not
    cache.set('c', 3);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);
  });
});
