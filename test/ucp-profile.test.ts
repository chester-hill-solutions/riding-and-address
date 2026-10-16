import { describe, it, expect } from 'vitest';
import {
  createUcpProfile,
  UCP_PROTOCOL_VERSION,
  UCP_SERVICE_NAME,
} from '../src/ucp-profile';
import { ROUTES } from '../src/routes';
import { createLookupTestEnv, fetchLookup } from './helpers/lookup-test-env';

/**
 * `/.well-known/ucp` is the UCP business profile agents fetch to discover CanCoder. These pin the
 * things the UCP 2026-08-25 profile schema actually requires, so the document cannot quietly
 * regress into something a conformant agent would reject — and so it never claims a capability or
 * payment handler CanCoder does not implement.
 *
 * Spec: https://ucp.dev/specification/overview/
 */

/** The UCP reverse-domain pattern, mirrored from common/types/reverse_domain_name.json. */
const REVERSE_DOMAIN = /^[a-z](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9_-]*[a-z0-9_])?)+$/;

const ORIGIN = 'https://lookup.test';

describe('UCP business profile document', () => {
  const profile = () => createUcpProfile(ORIGIN);

  it('serialises to JSON, since it is served verbatim at /.well-known/ucp', () => {
    expect(() => JSON.stringify(profile())).not.toThrow();
  });

  it('carries the required ucp.version, services, and payment_handlers registries', () => {
    // UCP requires both registries to be present even when empty; a missing key fails validation.
    const { ucp } = profile();
    expect(ucp.version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(ucp.version).toBe(UCP_PROTOCOL_VERSION);
    expect(ucp.services).toBeDefined();
    expect(ucp.payment_handlers).toBeDefined();
    expect(Object.keys(ucp.services).length).toBeGreaterThan(0);
  });

  it('claims no payment handler, since none is live', () => {
    // Paid Checkout is disabled and no account-free rail ships until W6; advertising a handler
    // here would be the exact "unsupported claim" the plan's risk table warns about.
    expect(profile().ucp.payment_handlers).toEqual({});
  });

  it('claims no capability CanCoder does not implement', () => {
    expect(profile().ucp).not.toHaveProperty('capabilities');
  });

  it('names the service under a reverse-domain namespace CanCoder owns', () => {
    expect(UCP_SERVICE_NAME).toBe('ca.chesterhillsolutions.cancoder');
    expect(UCP_SERVICE_NAME).toMatch(REVERSE_DOMAIN);
    expect(Object.keys(profile().ucp.services)).toEqual([UCP_SERVICE_NAME]);
  });

  it('declares one MCP transport binding with the fields the business schema requires', () => {
    // service.json#/$defs/business_schema requires version, transport, and endpoint for mcp.
    const bindings = profile().ucp.services[UCP_SERVICE_NAME];
    expect(bindings).toHaveLength(1);
    const [binding] = bindings;
    expect(binding.transport).toBe('mcp');
    expect(binding.version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(binding.endpoint).toBe(`${ORIGIN}/mcp`);
    expect(binding.spec).toBe(`${ORIGIN}/docs/agents.md`);
  });

  it('omits the authority-bound service schema rather than pinning it off-host', () => {
    // A service `schema` URL must reverse-match the namespace authority, so it could only live on
    // cancoder.chesterhillsolutions.ca — never on *.workers.dev. Omitting it keeps the profile
    // host-consistent; add it when an authority-bound OpenRPC is published.
    expect(profile().ucp.services[UCP_SERVICE_NAME][0]).not.toHaveProperty('schema');
  });

  it('resolves its URLs against the host that served it', () => {
    const other = createUcpProfile('https://cancoder.chesterhillsolutions.ca');
    expect(other.ucp.services[UCP_SERVICE_NAME][0].endpoint).toBe(
      'https://cancoder.chesterhillsolutions.ca/mcp'
    );
  });
});

describe('GET /.well-known/ucp', () => {
  it('is served on the request host and is classified internal so it stays out of OpenAPI', async () => {
    const entry = ROUTES.find((candidate) =>
      Array.isArray(candidate.path) && candidate.path.includes('/.well-known/ucp')
    );
    expect(entry?.owner).toBe('api');
    expect(entry?.visibility).toBe('internal');
  });

  it('returns the profile as JSON, resolving URLs against the request host', async () => {
    const env = { ...createLookupTestEnv(), PUBLIC_API_HOSTS: 'lookup.test' } as never;
    const response = await fetchLookup(env, '/.well-known/ucp');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    const body = (await response.json()) as {
      ucp: { version: string; services: Record<string, Array<{ endpoint: string }>> };
    };
    expect(body.ucp.version).toBe(UCP_PROTOCOL_VERSION);
    expect(body.ucp.services[UCP_SERVICE_NAME][0].endpoint).toBe(`${ORIGIN}/mcp`);
  });
});
