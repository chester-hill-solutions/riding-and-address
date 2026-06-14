import { describe, it, expect } from 'vitest';
import { safeParseBatchLookupRequests } from '../src/validation';

describe('safeParseBatchLookupRequests', () => {
  it('accepts valid batch lookup requests', () => {
    const result = safeParseBatchLookupRequests([
      {
        id: 'req_1',
        pathname: '/api/federal',
        query: { postal: 'K1A 0B1' },
      },
    ]);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('req_1');
    }
  });

  it('rejects requests missing required fields', () => {
    const result = safeParseBatchLookupRequests([
      {
        id: '',
        pathname: '/api/federal',
        query: { postal: 'K1A 0B1' },
      },
    ]);

    expect(result.success).toBe(false);
  });

  it('rejects invalid pathname values', () => {
    const result = safeParseBatchLookupRequests([
      {
        id: 'req_1',
        pathname: '/batch',
        query: { address: '123 Main St' },
      },
    ]);

    expect(result.success).toBe(false);
  });

  it('rejects empty query objects', () => {
    const result = safeParseBatchLookupRequests([
      {
        id: 'req_1',
        pathname: '/api',
        query: {},
      },
    ]);

    expect(result.success).toBe(false);
  });
});
