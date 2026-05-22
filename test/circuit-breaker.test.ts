import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CircuitBreaker, createCircuitBreaker } from '../src/circuit-breaker';

describe('CircuitBreaker (local state)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('executes a successful operation and returns the result', async () => {
    const cb = new CircuitBreaker(3, 30000, 2);
    const result = await cb.execute('test', async () => 'success');
    expect(result).toBe('success');
  });

  it('opens the circuit after failureThreshold consecutive failures', async () => {
    const cb = new CircuitBreaker(3, 30000, 2);
    const operation = vi.fn().mockRejectedValue(new Error('boom'));

    await expect(cb.execute('test', operation)).rejects.toThrow('boom');
    await expect(cb.execute('test', operation)).rejects.toThrow('boom');
    await expect(cb.execute('test', operation)).rejects.toThrow('boom');

    // Circuit should now be OPEN; the 4th call throws without invoking operation
    await expect(cb.execute('test', operation)).rejects.toThrow('Circuit breaker is OPEN for test');
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('does not open the circuit before failureThreshold failures', async () => {
    const cb = new CircuitBreaker(5, 30000, 2);
    const operation = vi.fn().mockRejectedValue(new Error('boom'));

    for (let i = 0; i < 4; i++) {
      await expect(cb.execute('test', operation)).rejects.toThrow('boom');
    }
    // 4 failures, threshold is 5, circuit still CLOSED
    await expect(cb.execute('test', operation)).rejects.toThrow('boom');
    expect(operation).toHaveBeenCalledTimes(5);
  });

  it('resets failure count after a single success', async () => {
    const cb = new CircuitBreaker(3, 30000, 2);
    const failOp = vi.fn().mockRejectedValue(new Error('boom'));
    const successOp = vi.fn().mockResolvedValue('ok');

    await expect(cb.execute('test', failOp)).rejects.toThrow('boom');
    await expect(cb.execute('test', failOp)).rejects.toThrow('boom');

    const result = await cb.execute('test', successOp);
    expect(result).toBe('ok');

    // After success, failure count is reset, so 3 more failures needed to open
    await expect(cb.execute('test', failOp)).rejects.toThrow('boom');
    await expect(cb.execute('test', failOp)).rejects.toThrow('boom');
    await expect(cb.execute('test', failOp)).rejects.toThrow('boom');

    // 4th failure after success should now see OPEN circuit
    await expect(cb.execute('test', failOp)).rejects.toThrow('Circuit breaker is OPEN for test');
    expect(failOp).toHaveBeenCalledTimes(5);
  });

  it('transitions from OPEN to HALF_OPEN after recoveryTimeout', async () => {
    const cb = new CircuitBreaker(2, 10000, 2);
    const failOp = vi.fn().mockRejectedValue(new Error('boom'));

    await expect(cb.execute('test', failOp)).rejects.toThrow('boom');
    await expect(cb.execute('test', failOp)).rejects.toThrow('boom');

    // Circuit is OPEN
    await expect(cb.execute('test', failOp)).rejects.toThrow('Circuit breaker is OPEN for test');

    // Advance time past recoveryTimeout
    vi.advanceTimersByTime(11000);

    // Should now be HALF_OPEN and allow one attempt
    const successOp = vi.fn().mockResolvedValue('ok');
    const result = await cb.execute('test', successOp);
    expect(result).toBe('ok');
  });

  it('transitions from HALF_OPEN to CLOSED after successThreshold successes', async () => {
    const cb = new CircuitBreaker(2, 10000, 2);
    const failOp = vi.fn().mockRejectedValue(new Error('boom'));

    await expect(cb.execute('test', failOp)).rejects.toThrow('boom');
    await expect(cb.execute('test', failOp)).rejects.toThrow('boom');

    vi.advanceTimersByTime(11000);

    const successOp = vi.fn().mockResolvedValue('ok');
    await cb.execute('test', successOp);
    await cb.execute('test', successOp);

    // Circuit should now be CLOSED again
    const state = await cb.getStateInfo('test');
    expect(state?.state).toBe('CLOSED');
    expect(state?.failureCount).toBe(0);
  });

  it('accumulates failures in HALF_OPEN before re-opening', async () => {
    const cb = new CircuitBreaker(2, 10000, 3);
    const failOp = vi.fn().mockRejectedValue(new Error('boom'));

    await expect(cb.execute('test', failOp)).rejects.toThrow('boom');
    await expect(cb.execute('test', failOp)).rejects.toThrow('boom');

    vi.advanceTimersByTime(11000);

    // HALF_OPEN: one success resets failureCount
    const successOp = vi.fn().mockResolvedValue('ok');
    await cb.execute('test', successOp);

    // One failure in HALF_OPEN brings count to 1 (not enough to open)
    await expect(cb.execute('test', failOp)).rejects.toThrow('boom');
    let state = await cb.getStateInfo('test');
    expect(state?.state).toBe('HALF_OPEN');

    // Second failure in HALF_OPEN brings count to 2 (threshold) → OPEN
    await expect(cb.execute('test', failOp)).rejects.toThrow('boom');
    state = await cb.getStateInfo('test');
    expect(state?.state).toBe('OPEN');

    // Next call should see OPEN circuit
    await expect(cb.execute('test', successOp)).rejects.toThrow('Circuit breaker is OPEN for test');
  });

  it('isolates state per key', async () => {
    const cb = new CircuitBreaker(2, 10000, 2);
    const failOp = vi.fn().mockRejectedValue(new Error('boom'));

    await expect(cb.execute('key-a', failOp)).rejects.toThrow('boom');
    await expect(cb.execute('key-a', failOp)).rejects.toThrow('boom');

    // key-a is OPEN; third call throws OPEN without invoking operation
    await expect(cb.execute('key-a', failOp)).rejects.toThrow('Circuit breaker is OPEN for key-a');

    // key-b should still be CLOSED
    await expect(cb.execute('key-b', failOp)).rejects.toThrow('boom');
    expect(failOp).toHaveBeenCalledTimes(3);
  });

  it('returns correct state info via getStateInfo', async () => {
    const cb = new CircuitBreaker(3, 30000, 2);
    const stateBefore = await cb.getStateInfo('test');
    expect(stateBefore).toBeNull();

    await cb.execute('test', async () => 'ok');
    const stateAfter = await cb.getStateInfo('test');
    expect(stateAfter?.state).toBe('CLOSED');
    expect(stateAfter?.failureCount).toBe(0);
    expect(stateAfter?.successCount).toBe(0);
  });

  it('returns all states via getAllStates', async () => {
    const cb = new CircuitBreaker(3, 30000, 2);
    await cb.execute('a', async () => 'ok');
    await cb.execute('b', async () => 'ok');

    const all = await cb.getAllStates();
    expect(all.size).toBe(2);
    expect(all.get('a')?.state).toBe('CLOSED');
    expect(all.get('b')?.state).toBe('CLOSED');
  });

  it('reset removes a specific key state', async () => {
    const cb = new CircuitBreaker(3, 30000, 2);
    await cb.execute('a', async () => 'ok');
    await cb.execute('b', async () => 'ok');

    await cb.reset('a');
    const all = await cb.getAllStates();
    expect(all.has('a')).toBe(false);
    expect(all.has('b')).toBe(true);
  });

  it('resetAll clears all states', async () => {
    const cb = new CircuitBreaker(3, 30000, 2);
    await cb.execute('a', async () => 'ok');
    await cb.execute('b', async () => 'ok');

    await cb.resetAll();
    const all = await cb.getAllStates();
    expect(all.size).toBe(0);
  });

  it('createCircuitBreaker factory returns a CircuitBreaker instance', () => {
    const cb = createCircuitBreaker(3, 30000, 2);
    expect(cb).toBeInstanceOf(CircuitBreaker);
  });

  it('uses custom thresholds provided in constructor', async () => {
    const cb = new CircuitBreaker(1, 5000, 1);
    const failOp = vi.fn().mockRejectedValue(new Error('boom'));

    // Only 1 failure needed to open
    await expect(cb.execute('test', failOp)).rejects.toThrow('boom');
    await expect(cb.execute('test', failOp)).rejects.toThrow('Circuit breaker is OPEN for test');

    vi.advanceTimersByTime(6000);

    // Only 1 success needed to close
    const successOp = vi.fn().mockResolvedValue('ok');
    await cb.execute('test', successOp);

    const state = await cb.getStateInfo('test');
    expect(state?.state).toBe('CLOSED');
  });
});
