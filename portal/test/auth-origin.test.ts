import { afterEach, expect, it, vi } from 'vitest';
import { env } from '../app/lib/env.server';
import { withPortalEnv } from './helpers/portal-db';

afterEach(() => vi.unstubAllEnvs());

it('refuses a deployed authentication origin missing from the actual request bindings', () => {
  vi.stubEnv('BASE_URL', '');
  vi.stubEnv('BETTER_AUTH_URL', '');
  expect(() => withPortalEnv({ ENVIRONMENT: 'staging', BASE_URL: '', BETTER_AUTH_URL: '' },
    () => env().baseUrl)).toThrow(/origin/i);
});

it('preserves the existing BetterAuth alias and normalizes agreeing explicit origins', () => {
  vi.stubEnv('BASE_URL', '');
  vi.stubEnv('BETTER_AUTH_URL', '');
  expect(withPortalEnv({ ENVIRONMENT: 'staging', BETTER_AUTH_URL: 'https://portal.example/' },
    () => env().baseUrl)).toBe('https://portal.example');
  expect(withPortalEnv({ ENVIRONMENT: 'staging', BASE_URL: 'https://PORTAL.example:443/',
    BETTER_AUTH_URL: 'https://portal.example' }, () => env().baseUrl)).toBe('https://portal.example');
});

it('refuses conflicting explicit authentication origins', () => {
  expect(() => withPortalEnv({ ENVIRONMENT: 'staging', BASE_URL: 'https://portal.example',
    BETTER_AUTH_URL: 'https://other.example' }, () => env().baseUrl)).toThrow(/conflict/i);
});

it.each(['ftp://portal.example', 'https://user:password@portal.example', 'https://portal.example/path',
  'https://portal.example?query=value', 'https://portal.example#fragment'])(
  'refuses a configured URL that is not an HTTP(S) origin: %s', value => {
    vi.stubEnv('BETTER_AUTH_URL', '');
    expect(() => withPortalEnv({ ENVIRONMENT: 'staging', BASE_URL: value, BETTER_AUTH_URL: '' },
      () => env().baseUrl)).toThrow(/origin/i);
  });

it('retains the explicit localhost convention only for an unconfigured development runtime', () => {
  vi.stubEnv('BASE_URL', '');
  vi.stubEnv('BETTER_AUTH_URL', '');
  expect(withPortalEnv({ ENVIRONMENT: '', BASE_URL: '', BETTER_AUTH_URL: '' },
    () => env().baseUrl)).toBe('http://localhost:5173');
});
