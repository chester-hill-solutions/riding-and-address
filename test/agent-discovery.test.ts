import { describe, it, expect } from 'vitest';
import {
  createAgentSkillsIndex,
  createAiCatalog,
  createAuthMd,
  createMcpServerCard,
  createRidingLookupSkill,
  ridingLookupSkillPath,
} from '../src/agent-discovery';
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
  });
});

describe('auth.md', () => {
  it('leads with an auth.md H1 and does not invent an OAuth flow', () => {
    const md = createAuthMd(ORIGIN);
    expect(md.split('\n')[0].toLowerCase()).toContain('auth.md');
    expect(md).toMatch(/no OAuth authorization server/i);
    // It must still say how to authenticate, and where a key comes from.
    expect(md).toContain('Authorization: Bearer sk_');
    expect(md).toContain(`${ORIGIN}/app/keys`);
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
