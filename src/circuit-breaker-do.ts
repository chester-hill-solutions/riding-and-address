import { CircuitBreakerState, Env } from './types';

/**
 * Durable Object for sharing circuit breaker state across worker instances.
 * Ensures consistent circuit breaker behavior when multiple workers are running.
 */
export class CircuitBreakerDO {
  private state: DurableObjectState;
  private env: Env;
  private states: Map<string, CircuitBreakerState>;
  private failureThreshold: number;
  private recoveryTimeout: number;
  private successThreshold: number;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.failureThreshold = 5;
    this.recoveryTimeout = 60000; // 60 seconds
    this.successThreshold = 3;
    this.states = new Map();
    this.loadState();
  }

  /**
   * Load circuit breaker state from Durable Object storage.
   */
  private async loadState(): Promise<void> {
    try {
      const stored = await this.state.storage.get<Map<string, CircuitBreakerState>>('circuitBreakers');
      if (stored) {
        this.states = stored;
      }
    } catch (error) {
      console.warn('[CircuitBreakerDO] Failed to load state:', error);
    }
  }

  /**
   * Save circuit breaker state to Durable Object storage.
   */
  private async saveState(): Promise<void> {
    try {
      await this.state.storage.put('circuitBreakers', this.states);
    } catch (error) {
      console.warn('[CircuitBreakerDO] Failed to save state:', error);
    }
  }

  /**
   * Handle success for a circuit breaker key.
   */
  async handleSuccess(key: string): Promise<void> {
    await this.onSuccess(key);
  }

  /**
   * Handle failure for a circuit breaker key.
   */
  async handleFailure(key: string): Promise<void> {
    await this.onFailure(key);
  }

  /**
   * Check if circuit breaker allows execution for a key.
   * Returns state info and whether execution should proceed.
   */
  async checkState(key: string): Promise<{ allowed: boolean; state: CircuitBreakerState }> {
    const state = this.getState(key);
    const now = Date.now();
    
    if (state.state === 'OPEN') {
      if (now - state.lastFailureTime > this.recoveryTimeout) {
        state.state = 'HALF_OPEN';
        state.successCount = 0;
        await this.saveState();
        return { allowed: true, state };
      } else {
        return { allowed: false, state };
      }
    }
    
    return { allowed: true, state };
  }

  /**
   * Get or create circuit breaker state for a key.
   */
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

  /**
   * Handle successful operation.
   */
  private async onSuccess(key: string): Promise<void> {
    const state = this.getState(key);
    state.failureCount = 0;
    
    if (state.state === 'HALF_OPEN') {
      state.successCount++;
      if (state.successCount >= this.successThreshold) {
        state.state = 'CLOSED';
      }
    }
    await this.saveState();
  }

  /**
   * Handle failed operation.
   */
  private async onFailure(key: string): Promise<void> {
    const state = this.getState(key);
    state.failureCount++;
    state.lastFailureTime = Date.now();
    state.nextAttemptTime = Date.now() + this.recoveryTimeout;
    
    if (state.failureCount >= this.failureThreshold) {
      state.state = 'OPEN';
    }
    await this.saveState();
  }

  /**
   * Get circuit breaker state for a key.
   */
  async getStateInfo(key: string): Promise<CircuitBreakerState | null> {
    await this.loadState();
    return this.states.get(key) || null;
  }

  /**
   * Get all circuit breaker states.
   */
  async getAllStates(): Promise<Map<string, CircuitBreakerState>> {
    await this.loadState();
    return new Map(this.states);
  }

  /**
   * Reset a specific circuit breaker.
   */
  async reset(key: string): Promise<void> {
    this.states.delete(key);
    await this.saveState();
  }

  /**
   * Reset all circuit breakers.
   */
  async resetAll(): Promise<void> {
    this.states.clear();
    await this.saveState();
  }

  /**
   * Update circuit breaker configuration.
   */
  async updateConfig(failureThreshold?: number, recoveryTimeout?: number, successThreshold?: number): Promise<void> {
    if (failureThreshold !== undefined) this.failureThreshold = failureThreshold;
    if (recoveryTimeout !== undefined) this.recoveryTimeout = recoveryTimeout;
    if (successThreshold !== undefined) this.successThreshold = successThreshold;
  }

  /**
   * Handle HTTP requests to the Durable Object (for monitoring/admin).
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/success' && request.method === 'POST') {
      const body = await request.json() as { key: string };
      await this.handleSuccess(body.key);
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (path === '/failure' && request.method === 'POST') {
      const body = await request.json() as { key: string };
      await this.handleFailure(body.key);
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (path === '/check' && request.method === 'POST') {
      const body = await request.json() as { key: string };
      const result = await this.checkState(body.key);
      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (path === '/state' && request.method === 'GET') {
      const key = url.searchParams.get('key');
      if (key) {
        const state = await this.getStateInfo(key);
        return new Response(JSON.stringify(state), {
          headers: { 'Content-Type': 'application/json' }
        });
      } else {
        const allStates = await this.getAllStates();
        const statesObj = Object.fromEntries(allStates);
        return new Response(JSON.stringify(statesObj), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    if (path === '/reset' && request.method === 'POST') {
      const key = url.searchParams.get('key');
      if (key) {
        await this.reset(key);
        return new Response(JSON.stringify({ success: true, message: `Circuit breaker ${key} reset` }), {
          headers: { 'Content-Type': 'application/json' }
        });
      } else {
        await this.resetAll();
        return new Response(JSON.stringify({ success: true, message: 'All circuit breakers reset' }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    if (path === '/config' && request.method === 'POST') {
      const body = await request.json() as { failureThreshold?: number; recoveryTimeout?: number; successThreshold?: number };
      await this.updateConfig(body.failureThreshold, body.recoveryTimeout, body.successThreshold);
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response('Not found', { status: 404 });
  }
}

