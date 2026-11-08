import { afterEach, describe, expect, it } from 'vitest';
import { absoluteAppUrl, appPublicOrigin, authTrustedOrigins, MissingPublicOriginError } from '../src/index.js';

const environment = { RAILWAY_PUBLIC_DOMAIN: process.env.RAILWAY_PUBLIC_DOMAIN, APP_PUBLIC_ORIGIN: process.env.APP_PUBLIC_ORIGIN, APP_TRUSTED_ORIGINS: process.env.APP_TRUSTED_ORIGINS };

function withEnvironment(values: Record<string, string | undefined>): void {
  for (const [name, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

afterEach(() => { withEnvironment(environment); });

describe('the public origin of a deployed application', () => {
  it('adds the scheme to the domain that the platform publishes', () => {
    withEnvironment({ RAILWAY_PUBLIC_DOMAIN: 'campaign-os.up.railway.app', APP_PUBLIC_ORIGIN: undefined });
    expect(appPublicOrigin()).toBe('https://campaign-os.up.railway.app');
  });

  it('keeps the scheme of a platform domain that already has one', () => {
    withEnvironment({ RAILWAY_PUBLIC_DOMAIN: 'http://campaign-os.internal', APP_PUBLIC_ORIGIN: undefined });
    expect(appPublicOrigin()).toBe('http://campaign-os.internal');
  });

  it('removes the trailing slash of the platform domain', () => {
    withEnvironment({ RAILWAY_PUBLIC_DOMAIN: 'campaign-os.up.railway.app/', APP_PUBLIC_ORIGIN: undefined });
    expect(appPublicOrigin()).toBe('https://campaign-os.up.railway.app');
  });

  it('uses the origin of the host when the platform publishes no domain', () => {
    withEnvironment({ RAILWAY_PUBLIC_DOMAIN: undefined, APP_PUBLIC_ORIGIN: 'https://campaign-os.example/' });
    expect(appPublicOrigin()).toBe('https://campaign-os.example');
  });

  it('has no origin when no host has configured one', () => {
    withEnvironment({ RAILWAY_PUBLIC_DOMAIN: undefined, APP_PUBLIC_ORIGIN: undefined });
    expect(appPublicOrigin()).toBe('');
  });

  it('ignores a blank configuration', () => {
    withEnvironment({ RAILWAY_PUBLIC_DOMAIN: '   ', APP_PUBLIC_ORIGIN: '   ' });
    expect(appPublicOrigin()).toBe('');
  });
});

describe('the origins that a redirect may use', () => {
  it('holds the public origin and the configured origins', () => {
    withEnvironment({ RAILWAY_PUBLIC_DOMAIN: 'campaign-os.up.railway.app', APP_TRUSTED_ORIGINS: 'https://campaign-os.example,https://other.example' });
    expect(authTrustedOrigins()).toEqual(['https://campaign-os.up.railway.app', 'https://campaign-os.example', 'https://other.example']);
  });

  it('holds each origin once', () => {
    withEnvironment({ RAILWAY_PUBLIC_DOMAIN: 'campaign-os.up.railway.app', APP_TRUSTED_ORIGINS: 'https://campaign-os.up.railway.app' });
    expect(authTrustedOrigins()).toEqual(['https://campaign-os.up.railway.app']);
  });

  it('uses the fallback when no host has configured an origin', () => {
    withEnvironment({ RAILWAY_PUBLIC_DOMAIN: undefined, APP_PUBLIC_ORIGIN: undefined, APP_TRUSTED_ORIGINS: undefined });
    expect(authTrustedOrigins()).toEqual(['http://localhost:5173']);
  });

  it('uses the fallback of the caller', () => {
    withEnvironment({ RAILWAY_PUBLIC_DOMAIN: undefined, APP_PUBLIC_ORIGIN: undefined, APP_TRUSTED_ORIGINS: undefined });
    expect(authTrustedOrigins('https://fallback.example')).toEqual(['https://fallback.example']);
  });
});

describe('an absolute address of the application', () => {
  const request = new Request('https://internal.example/current');

  it('uses the public origin', () => {
    withEnvironment({ RAILWAY_PUBLIC_DOMAIN: 'campaign-os.up.railway.app', APP_PUBLIC_ORIGIN: undefined });
    expect(absoluteAppUrl(request, '/members')).toBe('https://campaign-os.up.railway.app/members');
  });

  it('refuses to build a link when no host has configured an origin', () => {
    // The request origin is the origin the caller reached the application on, so a Host header
    // would decide where an authentication link points. The call fails closed instead.
    withEnvironment({ RAILWAY_PUBLIC_DOMAIN: undefined, APP_PUBLIC_ORIGIN: undefined });
    expect(() => absoluteAppUrl(request, '/members')).toThrow(MissingPublicOriginError);
  });

  it('does not fall back to the origin the request arrived on', () => {
    withEnvironment({ RAILWAY_PUBLIC_DOMAIN: undefined, APP_PUBLIC_ORIGIN: undefined });
    let thrown: unknown;
    try {
      absoluteAppUrl(new Request('https://attacker.example/current'), '/members');
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(MissingPublicOriginError);
    expect(String(thrown)).not.toContain('attacker.example');
  });

  it('adds the leading slash of a path that has none', () => {
    withEnvironment({ RAILWAY_PUBLIC_DOMAIN: 'campaign-os.up.railway.app', APP_PUBLIC_ORIGIN: undefined });
    expect(absoluteAppUrl(request, 'members')).toBe('https://campaign-os.up.railway.app/members');
  });

  // Origin-preservation cases from #177; missing configuration still fails closed.
  const escapingPaths: [string, string][] = [
    ['a protocol-relative path', '//evil.example/phish'],
    ['a protocol-relative path with no path', '//evil.example'],
    ['a backslash-separated authority', '/\\evil.example/phish'],
    ['a doubled backslash', '/\\\\evil.example/phish'],
    ['a tab before the authority', '/\t/evil.example/phish'],
    ['a newline before the authority', '/\n/evil.example/phish'],
  ];

  for (const [description, path] of escapingPaths) {
    it(`rejects ${description} on the configured origin`, () => {
      withEnvironment({ RAILWAY_PUBLIC_DOMAIN: undefined, APP_PUBLIC_ORIGIN: 'https://app.example' });
      expect(() => absoluteAppUrl(request, path)).toThrow(TypeError);
    });
  }

  it('keeps same-origin paths containing doubled slashes', () => {
    withEnvironment({ RAILWAY_PUBLIC_DOMAIN: undefined, APP_PUBLIC_ORIGIN: 'https://app.example' });
    expect(absoluteAppUrl(request, '/members//42')).toBe('https://app.example/members//42');
  });

});
