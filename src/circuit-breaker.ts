import { CircuitBreakerState, Env } from './types';

/**
 * Circuit breaker wrapper that uses Durable Object for shared state when available,
 * falls back to in-memory state when Durable Object is not configured.
 */
export class CircuitBreaker {
  private states = new Map<string, CircuitBreakerState>();
  private failureThreshold: number;
  private recoveryTimeout: number;
  private successThreshold: number;
  private env?: Env;
  private useDurableObject: boolean;

  constructor(failureThreshold = 5, recoveryTimeout = 60000, successThreshold = 3, env?: Env) {
    this.failureThreshold = failureThreshold;
    this.recoveryTimeout = recoveryTimeout;
    this.successThreshold = successThreshold;
    this.env = env;
    this.useDurableObject = !!env?.CIRCUIT_BREAKER_DO;
  }

  /**
   * Get the Durable Object stub for circuit breaker state.
   */
  private getDOStub() {
    if (!this.env?.CIRCUIT_BREAKER_DO) return null;
    // Use a single Durable Object instance for all circuit breakers
    const id = this.env.CIRCUIT_BREAKER_DO.idFromName('circuit-breaker');
    return this.env.CIRCUIT_BREAKER_DO.get(id);
  }

  async execute<T>(
    key: string,
    operation: () => Promise<T>,
    options?: { shouldCountFailure?: (error: unknown) => boolean }
  ): Promise<T> {
    const shouldCountFailure = options?.shouldCountFailure ?? (() => true);

    // Use Durable Object if available, otherwise use local state
    if (this.useDurableObject) {
      const stub = this.getDOStub();
      if (stub) {
        try {
          // Check state with Durable Object
          const checkResponse = await stub.fetch(new Request('https://circuit-breaker/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key })
          }));
          
          if (checkResponse.ok) {
            const checkResult = await checkResponse.json() as { allowed: boolean; state: CircuitBreakerState };
            if (!checkResult.allowed) {
              throw new Error(`Circuit breaker is OPEN for ${key}`);
            }
            
            // Execute operation locally, then report result to DO
            try {
              const result = await operation();
              await this.reportSuccess(key);
              return result;
            } catch (error) {
              if (shouldCountFailure(error)) {
                await this.reportFailure(key);
              }
              throw error;
            }
          }
        } catch (error) {
          // Fallback to local state if DO call fails
          if (error instanceof Error && error.message.includes('Circuit breaker is OPEN')) {
            throw error;
          }
          console.warn('[CircuitBreaker] Durable Object call failed, using local state:', error);
        }
      }
    }
    
    // Fallback to local state
    const state = this.getState(key);
    
    if (state.state === 'OPEN') {
      if (Date.now() - state.lastFailureTime > this.recoveryTimeout) {
        state.state = 'HALF_OPEN';
        state.successCount = 0;
      } else {
        throw new Error(`Circuit breaker is OPEN for ${key}`);
      }
    }

    try {
      const result = await operation();
      this.onSuccess(key);
      return result;
    } catch (error) {
      if (shouldCountFailure(error)) {
        this.onFailure(key);
      }
      throw error;
    }
  }

  private getState(key: string): CircuitBreakerState {
    if (!this.states.has(key)) {
      this.states.set(key, {
        state: 'CLOSED',
        failureCount: 0,
        lastFailureTime: 0,
        successCount: 0,
        nextAttemptTime: 0
      });
    }
    return this.states.get(key)!;
  }

  private onSuccess(key: string): void {
    const state = this.getState(key);
    state.failureCount = 0;
    
    if (state.state === 'HALF_OPEN') {
      state.successCount++;
      if (state.successCount >= this.successThreshold) {
        state.state = 'CLOSED';
      }
    }
  }

  private onFailure(key: string): void {
    const state = this.getState(key);
    state.failureCount++;
    state.lastFailureTime = Date.now();
    state.nextAttemptTime = Date.now() + this.recoveryTimeout;
    
    if (state.failureCount >= this.failureThreshold) {
      state.state = 'OPEN';
    }
  }

  /**
   * Get state from Durable Object or local state.
   */
  private async getDOState(key: string): Promise<CircuitBreakerState | null> {
    if (this.useDurableObject) {
      const stub = this.getDOStub();
      if (stub) {
        try {
          const response = await stub.fetch(new Request(`https://circuit-breaker/state?key=${encodeURIComponent(key)}`));
          if (response.ok) {
            return await response.json() as CircuitBreakerState;
          }
        } catch (error) {
          console.warn('[CircuitBreaker] Failed to get state from DO:', error);
        }
      }
    }
    return this.states.get(key) || null;
  }

  /**
   * Report success to Durable Object or update local state.
   */
  private async reportSuccess(key: string): Promise<void> {
    if (this.useDurableObject) {
      const stub = this.getDOStub();
      if (stub) {
        try {
          await stub.fetch(new Request('https://circuit-breaker/success', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key })
          }));
          return;
        } catch (error) {
          console.warn('[CircuitBreaker] Failed to report success to DO:', error);
        }
      }
    }
    this.onSuccess(key);
  }

  /**
   * Report failure to Durable Object or update local state.
   */
  private async reportFailure(key: string): Promise<void> {
    if (this.useDurableObject) {
      const stub = this.getDOStub();
      if (stub) {
        try {
          await stub.fetch(new Request('https://circuit-breaker/failure', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key })
          }));
          return;
        } catch (error) {
          console.warn('[CircuitBreaker] Failed to report failure to DO:', error);
        }
      }
    }
    this.onFailure(key);
  }

  async getStateInfo(key: string): Promise<CircuitBreakerState | null> {
    if (this.useDurableObject) {
      return await this.getDOState(key);
    }
    return this.states.get(key) || null;
  }

  // Get all circuit breaker states for monitoring
  async getAllStates(): Promise<Map<string, CircuitBreakerState>> {
    if (this.useDurableObject) {
      const stub = this.getDOStub();
      if (stub) {
        try {
          const response = await stub.fetch(new Request('https://circuit-breaker/state'));
          if (response.ok) {
            const statesObj = await response.json() as Record<string, CircuitBreakerState>;
            return new Map(Object.entries(statesObj));
          }
        } catch (error) {
          console.warn('[CircuitBreaker] Failed to get all states from DO:', error);
        }
      }
    }
    return new Map(this.states);
  }

  // Reset a specific circuit breaker
  async reset(key: string): Promise<void> {
    if (this.useDurableObject) {
      const stub = this.getDOStub();
      if (stub) {
        try {
          await stub.fetch(new Request(`https://circuit-breaker/reset?key=${encodeURIComponent(key)}`, { method: 'POST' }));
          return;
        } catch (error) {
          console.warn('[CircuitBreaker] Failed to reset in DO:', error);
        }
      }
    }
    this.states.delete(key);
  }

  // Reset all circuit breakers
  async resetAll(): Promise<void> {
    if (this.useDurableObject) {
      const stub = this.getDOStub();
      if (stub) {
        try {
          await stub.fetch(new Request('https://circuit-breaker/reset', { method: 'POST' }));
          return;
        } catch (error) {
          console.warn('[CircuitBreaker] Failed to reset all in DO:', error);
        }
      }
    }
    this.states.clear();
  }
}

/**
 * Factory function to create circuit breakers with environment support.
 */
export function createCircuitBreaker(failureThreshold: number, recoveryTimeout: number, successThreshold: number, env?: Env): CircuitBreaker {
  return new CircuitBreaker(failureThreshold, recoveryTimeout, successThreshold, env);
}

// Create circuit breaker instances (will be initialized with env in worker)
export let geocodingCircuitBreaker: CircuitBreaker;
export let r2CircuitBreaker: CircuitBreaker;

/**
 * Initialize circuit breakers with environment.
 * Call this from worker.ts on startup.
 */
export function initializeCircuitBreakers(env: Env): void {
  geocodingCircuitBreaker = new CircuitBreaker(3, 30000, 2, env); // 3 failures, 30s timeout, 2 successes to close
  r2CircuitBreaker = new CircuitBreaker(5, 60000, 3, env); // 5 failures, 60s timeout, 3 successes to close
}
