import { describe, it, expect } from 'vitest';
import { resolveCorsOrigin, securityHeaders } from '../src/http-headers';
import { Env } from '../src/types';

describe('resolveCorsOrigin', () => {
  it('returns wildcard without credentials when ALLOWED_ORIGINS unset', () => {
    // Reflecting arbitrary request origins here would let any site pair the echoed origin
    // with Allow-Credentials for authenticated cross-origin reads.
    expect(resolveCorsOrigin({} as Env, 'https://portal.example')).toEqual({
      allowOrigin: '*',
      allowCredentials: false,
    });
  });

  it('echoes an allowlisted origin with credentials', () => {
    const env = { ALLOWED_ORIGINS: 'https://portal.example,https://app.example' } as Env;
    expect(resolveCorsOrigin(env, 'https://portal.example')).toEqual({
      allowOrigin: 'https://portal.example',
      allowCredentials: true,
    });
    expect(resolveCorsOrigin(env, 'https://app.example')).toEqual({
      allowOrigin: 'https://app.example',
      allowCredentials: true,
    });
  });

  it('gives a non-allowlisted origin no usable CORS grant and no credentials', () => {
    const env = { ALLOWED_ORIGINS: 'https://portal.example,https://app.example' } as Env;
    // First configured origin is a browser no-op for evil.example; the point is that it is
    // neither an echo of the caller nor paired with Allow-Credentials.
    expect(resolveCorsOrigin(env, 'https://evil.example')).toEqual({
      allowOrigin: 'https://portal.example',
      allowCredentials: false,
    });
  });

  it('never grants credentials with a configured wildcard', () => {
    const env = { ALLOWED_ORIGINS: '*' } as Env;
    expect(resolveCorsOrigin(env, 'https://portal.example')).toEqual({
      allowOrigin: '*',
      allowCredentials: false,
    });
  });

  it('handles an absent request origin against an allowlist', () => {
    const env = { ALLOWED_ORIGINS: 'https://portal.example' } as Env;
    expect(resolveCorsOrigin(env, null)).toEqual({
      allowOrigin: 'https://portal.example',
      allowCredentials: false,
    });
  });
});

describe('securityHeaders', () => {
  it('includes nosniff', () => {
    expect(securityHeaders()['X-Content-Type-Options']).toBe('nosniff');
  });
});
