import { describe, it, expect } from 'vitest';
import {
  createAgentSkillsIndex,
  createAiCatalog,
  createAuthMd,
  createMcpServerCard,
  createRidingLookupSkill,
  ridingLookupSkillPath,
} from '../src/agent-discovery';
import { getAgentQuickstart } from '../src/mcp';
import { createLookupTestEnv, fetchLookup } from './helpers/lookup-test-env';

/**
 * These documents are read literally by agents, so the tests are about honesty as much as shape:
 * the ARD field names the spec requires, an MCP card that describes the tools we actually expose,
 * an auth.md that does not invent a registration flow, and a skill digest that matches the artifact.
 */

const ORIGIN = 'https://lookup.test';

describe('ARD manifest (/.well-known/ai-catalog.json)', () => {
  it('uses the identifier field names the ai-catalog data model requires', () => {
    const catalog = createAiCatalog(ORIGIN) as {
      specVersion: string;
      host: Record<string, unknown>;
      entries: Array<Record<string, unknown>>;
    };
    // The scanner's failure was exactly this: entries carried `id`, the spec wants `identifier`.
    expect(catalog.entries.every((entry) => 'identifier' in entry && !('id' in entry))).toBe(true);
    expect(catalog.host).toHaveProperty('displayName');
    expect(catalog.host).toHaveProperty('identifier');
    expect(catalog.host).not.toHaveProperty('name');
    expect(catalog.specVersion).toBeTruthy();
  });

  it('gives every entry exactly one of url or data, and an urn identifier', () => {
    const catalog = createAiCatalog(ORIGIN) as { entries: Array<Record<string, unknown>> };
    for (const entry of catalog.entries) {
      const hasUrl = 'url' in entry;
      const hasData = 'data' in entry;
      expect(hasUrl !== hasData, `${entry.identifier} must have exactly one of url/data`).toBe(true);
      expect(String(entry.identifier)).toMatch(/^urn:air:lookup\.test:/);
      expect(String(entry.type)).toContain('/');
      expect(Array.isArray(entry.representativeQueries)).toBe(true);
    }
  });
});

describe('MCP Server Card', () => {
  it('describes the tools the server actually exposes', () => {
    const card = createMcpServerCard(ORIGIN) as {
      serverInfo: { name: string; version: string };
      transport: { type: string; endpoint: string };
      capabilities: { tools: Array<{ name: string }> };
    };
    expect(card.serverInfo.name).toBe('CanCoder');
    expect(card.serverInfo.version).toBeTruthy();
    expect(card.transport.endpoint).toBe(`${ORIGIN}/mcp`);
    const toolNames = card.capabilities.tools.map((tool) => tool.name);
    expect(toolNames).toContain('lookup_riding');
    expect(toolNames).toContain('quote_lookup');
    expect(toolNames).toContain('quote_area');
    expect(toolNames).toContain('purchase');
  });
});

describe('auth.md', () => {
  it('leads with an auth.md H1, and claims only the OAuth surface that exists', () => {
    const md = createAuthMd(ORIGIN);
    expect(md.split('\n')[0].toLowerCase()).toContain('auth.md');

    // The boundary has moved twice. First from "there is no OAuth authorization server" to "the
    // server exists but its protected-resource metadata does not", and now to both existing. What
    // the assertions guard is unchanged: the document may only name things that answer. The URLs it
    // names here are checked live by `test/oauth-resource.test.ts`, which serves them.
    expect(md).toContain(`${ORIGIN}/api/auth/.well-known/oauth-authorization-server`);
    // Published now, and it names where — so a client reading this can check the claim by fetching
    // the URL rather than taking the document's word for it.
    expect(md).toContain(`${ORIGIN}/.well-known/oauth-protected-resource`);

    // It must still say how to authenticate, and where a key comes from.
    expect(md).toContain('Authorization: Bearer sk_');
    expect(md).toContain(`${ORIGIN}/app/keys`);
  });

  it('names both ways a client can identify itself, and the one that is live', () => {
    const md = createAuthMd(ORIGIN);

    // The document said "pre-registration only" while the server accepted a Client ID Metadata
    // Document — and on production there is no pre-registered client at all, so a client reading
    // it would have concluded it could not get a token. The mechanism is the same one ADR 0010
    // chose, and the one the live walk used.
    expect(md).toContain('Client ID Metadata Document');
    expect(md).toContain('Pre-registration');

    // And it must not imply a registration endpoint that does not answer.
    expect(md).toMatch(/Dynamic registration is \*\*not\*\* enabled|no self-registration endpoint/);
  });

  it('tells the client what the consent screen needs, and that a person approves', () => {
    const md = createAuthMd(ORIGIN);

    // The profile is `mcp-2026-07-28`, which is stricter than draft-02 about exactly these two
    // fields. An agent that publishes a document without them gets a consent screen that cannot
    // say what it is asking a person to approve.
    expect(md).toContain('client_name');
    expect(md).toContain('redirect_uris');

    // And the consent screen needs a person. An agent cannot approve on the user's behalf, and a
    // document that does not say so sends the agent looking for a flow that does not exist.
    expect(md).toContain(`${ORIGIN}/consent`);
    expect(md).toMatch(/a signed-in user|person approves/);
  });

  it('names the scopes, which are the ones the server advertises and the challenge names', () => {
    const md = createAuthMd(ORIGIN);
    expect(md).toContain('ridings:lookup');
    expect(md).toContain('ridings:area');
  });
});

describe('the riding-lookup skill', () => {
  it('offers the OAuth route, not only the Server key', () => {
    const skill = createRidingLookupSkill(ORIGIN);

    // The skill's Cost section said "Metered calls need a Server API key". This is the document
    // an agent loads *as a skill*, so it is the one most likely to be read — and it sent the
    // reader to a human-created key for a route that needs no key at all.
    expect(skill).toContain('Server API key');
    expect(skill).toContain('OAuth');
    expect(skill).toContain(`${ORIGIN}/auth.md`);
  });
});

describe('the agent quickstart', () => {
  it('offers the OAuth route, not only the Server key', () => {
    const guide = getAgentQuickstart(ORIGIN);

    // The guide told an agent to create a Server key and said nothing about the authorization
    // server this same deployment runs. A key is the wrong answer for an agent: it has to be
    // created by a person, copied by hand, and then it is a Customer-wide credential.
    expect(guide).toContain('Authorization: Bearer <server-key>');
    expect(guide).toContain('OAuth');
    expect(guide).toContain(`${ORIGIN}/auth.md`);
  });
});

describe('Agent Skills index', () => {
  it('publishes the schema version and a digest of the artifact actually served', async () => {
    const index = (await createAgentSkillsIndex(ORIGIN)) as {
      $schema: string;
      skills: Array<{ name: string; type: string; url: string; digest: string }>;
    };
    expect(index.$schema).toBe('https://schemas.agentskills.io/discovery/0.2.0/schema.json');
    const [skill] = index.skills;
    expect(skill.name).toBe('cancoder-riding-lookup');
    expect(skill.type).toBe('skill-md');
    expect(skill.url).toBe(`${ORIGIN}${ridingLookupSkillPath()}`);

    // The digest must be the SHA-256 of the artifact at that URL, or an agent verifying it fails.
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(createRidingLookupSkill(ORIGIN))
    );
    const expected = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
    expect(skill.digest).toBe(`sha256:${expected}`);
  });
});

describe('the new discovery routes are served', () => {
  const env = () => ({ ...createLookupTestEnv(), PUBLIC_API_HOSTS: 'lookup.test' }) as never;

  it.each([
    ['/auth.md', 'text/markdown'],
    ['/.well-known/mcp/server-card.json', 'application/json'],
    ['/.well-known/agent-skills/index.json', 'application/json'],
    ['/.well-known/ai-catalog.json', 'application/json'],
    [ridingLookupSkillPath(), 'text/markdown'],
  ])('%s is served as %s', async (path, contentType) => {
    const response = await fetchLookup(env(), path);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain(contentType);
  });

  it('points robots.txt at the ARD manifest', async () => {
    const response = await fetchLookup(env(), '/robots.txt');
    expect(await response.text()).toContain(`Agentmap: ${ORIGIN}/.well-known/ai-catalog.json`);
  });
});
