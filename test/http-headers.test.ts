import { describe, it, expect } from 'vitest';
import { resolveCorsOrigin, securityHeaders } from '../src/http-headers';
import { Env } from '../src/types';

describe('resolveCorsOrigin', () => {
  it('reflects request origin when ALLOWED_ORIGINS unset', () => {
    expect(resolveCorsOrigin({} as Env, 'https://portal.example')).toBe('https://portal.example');
  });

  it('allows only configured origins', () => {
    const env = { ALLOWED_ORIGINS: 'https://portal.example,https://app.example' } as Env;
    expect(resolveCorsOrigin(env, 'https://portal.example')).toBe('https://portal.example');
    expect(resolveCorsOrigin(env, 'https://evil.example')).toBe('https://portal.example');
  });
});

describe('securityHeaders', () => {
  it('includes nosniff', () => {
    expect(securityHeaders()['X-Content-Type-Options']).toBe('nosniff');
  });
});
