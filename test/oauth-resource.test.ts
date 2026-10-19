import { describe, expect, it } from 'vitest';

import {
  buildProtectedResourceMetadata,
  mcpResource,
  protectedResourceMetadataPaths,
  protectedResourceMetadataResponse,
  resourceMetadataUrl,
} from '../src/oauth-metadata';
import { bearerChallenge, unauthorizedMcpResponse } from '../src/oauth-challenge';
import { LOOKUP_SCOPE, MCP_SCOPES, hasScope } from '../src/mcp-scopes';

const ORIGIN = 'https://lookup.test';

describe('protected resource metadata', () => {
  it('points at the resource-path-inserted URL the challenge advertises', () => {
    // Not the bare well-known root: this is the URL Better Auth's own challenge names, so it is the
    // one a client is told to fetch and the one that has to answer.
    expect(resourceMetadataUrl(ORIGIN)).toBe(`${ORIGIN}/.well-known/oauth-protected-resource/mcp`);
  });

  it('serves both placements, so a client that guesses the other is not 404ed', () => {
    expect(protectedResourceMetadataPaths()).toEqual([
      '/.well-known/oauth-protected-resource',
      '/.well-known/oauth-protected-resource/mcp',
    ]);
  });

  it('describes this deployment rather than a fixed one', () => {
    const metadata = buildProtectedResourceMetadata(ORIGIN);
    expect(metadata.resource).toBe(`${ORIGIN}/mcp`);
    expect(metadata.resource).toBe(mcpResource(ORIGIN));
    // The issuer is under a base path — a client that assumes the origin finds nothing at the
    // well-known root.
    expect(metadata.authorization_servers).toEqual([`${ORIGIN}/api/auth`]);
    expect(metadata.jwks_uri).toBe(`${ORIGIN}/api/auth/jwks`);
    expect(metadata.bearer_methods_supported).toEqual(['header']);
  });

  it('publishes the scopes the authorization server issues', () => {
    // One list, two documents. A client told it may request a scope the resource server does not
    // recognise would only find out at the first tool call.
    expect(buildProtectedResourceMetadata(ORIGIN).scopes_supported).toEqual([...MCP_SCOPES]);
  });

  it('is a 200 with a JSON body, cacheable for a short while', async () => {
    const response = protectedResourceMetadataResponse(ORIGIN);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.get('cache-control')).toBe('public, max-age=300');
    expect((await response.json()) as { resource: string }).toMatchObject({ resource: `${ORIGIN}/mcp` });
  });
});

describe('the MCP challenge', () => {
  it('matches the shape Better Auth emits, so a client cannot tell which of us answered', () => {
    expect(bearerChallenge(ORIGIN, LOOKUP_SCOPE)).toBe(
      `Bearer resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/mcp", scope="ridings:lookup"`
    );
  });

  it('omits scope rather than emitting it empty', () => {
    expect(bearerChallenge(ORIGIN)).toBe(
      `Bearer resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/mcp"`
    );
  });

  it('answers 401 with a JSON-RPC body, because an MCP client parses that', async () => {
    const response = unauthorizedMcpResponse(ORIGIN, LOOKUP_SCOPE, 'no credential');
    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('www-authenticate')).toContain('resource_metadata=');
    expect(await response.json()).toMatchObject({
      jsonrpc: '2.0',
      error: { code: -32000 },
      id: null,
    });
  });

});

describe('scopes', () => {
  it('has no implication between them', () => {
    // A lookup is half a cent and an area search can be $8. One approval must not authorise both,
    // and nothing here is a superset of anything else — saying so beats inventing a hierarchy.
    expect(hasScope(['ridings:area'], LOOKUP_SCOPE)).toBe(false);
    expect(hasScope(['ridings:lookup'], LOOKUP_SCOPE)).toBe(true);
    expect(hasScope([], LOOKUP_SCOPE)).toBe(false);
  });

  it('names the lookup scope explicitly so a reorder cannot change the challenge', () => {
    expect(LOOKUP_SCOPE).toBe('ridings:lookup');
  });
});
