import { describe, it, expect } from 'vitest';
import { getTimeoutConfig, GEOCODING_STAGE_TIMEOUTS } from '../src/config';
import { Env } from '../src/types';

describe('getTimeoutConfig', () => {
  it('uses separate geocoding and batch timeouts', () => {
    const env = {
      BATCH_TIMEOUT: 30000,
      GEOCODING_TIMEOUT: 10000,
      LOOKUP_TIMEOUT: 5000,
      TOTAL_TIMEOUT: 60000,
    } as Env;

    const config = getTimeoutConfig(env);
    expect(config.geocoding).toBe(10000);
    expect(config.batch).toBe(30000);
    expect(config.lookup).toBe(5000);
    expect(config.total).toBe(60000);
  });

  it('does not conflate BATCH_TIMEOUT with geocoding default', () => {
    const env = { BATCH_TIMEOUT: 30000 } as Env;
    const config = getTimeoutConfig(env);
    expect(config.geocoding).toBe(10000);
    expect(config.batch).toBe(30000);
  });

  it('exposes per-stage geocoding ceilings from GEOCODING_STAGE_TIMEOUTS', () => {
    const config = getTimeoutConfig({} as Env);
    expect(config.stages).toEqual({ ...GEOCODING_STAGE_TIMEOUTS });
  });
});
