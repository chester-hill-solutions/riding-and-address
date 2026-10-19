import { describe, it, expect } from 'vitest';
import { createLlmsTxt, createLlmsFullTxt } from '../src/llms-txt';
import { createLookupTestEnv, fetchLookup } from './helpers/lookup-test-env';

/**
 * `/llms.txt` and `/llms-full.txt` are the convention language models look for. They are pure
 * pointers, so the only things worth pinning are that they resolve against the host that served
 * them and that the full document actually contains the agent guide.
 */

const ORIGIN = 'https://lookup.test';

describe('llms.txt', () => {
  it('leads with the service name and a one-line summary', () => {
    const text = createLlmsTxt(ORIGIN);
    expect(text.startsWith('# CanCoder\n')).toBe(true);
    expect(text).toContain('> Canadian address autocomplete');
  });

  it('links the real discovery and documentation resources on the serving host', () => {
    const text = createLlmsTxt(ORIGIN);
    for (const path of [
      '/docs/agents.md',
      '/docs',
      '/api/docs',
      '/.well-known/cancoder.json',
      '/.well-known/ucp',
      '/.well-known/api-catalog',
      '/.well-known/ai-catalog.json',
      '/mcp',
      '/api/quote',
    ]) {
      expect(text, `${path} is not linked`).toContain(`${ORIGIN}${path}`);
    }
  });

  it('names the OAuth route, and links the document that describes it', () => {
    const text = createLlmsTxt(ORIGIN);

    // The index said "metered Server API keys for production" and gave a client that wants a
    // scoped token no way in. It links the API reference already, so it can link this too.
    expect(text).toContain(`${ORIGIN}/auth.md`);
    expect(text).toMatch(/Server API keys — or scoped OAuth access tokens — for production/);
  });

  it('resolves against the host that served it', () => {
    expect(createLlmsTxt('https://cancoder.chesterhillsolutions.ca')).toContain(
      'https://cancoder.chesterhillsolutions.ca/api/docs'
    );
  });

  it('includes the agent guide in full', () => {
    const full = createLlmsFullTxt(ORIGIN);
    expect(full).toContain(createLlmsTxt(ORIGIN));
    expect(full).toContain('# CanCoder for AI agents');
  });
});

describe('GET /llms.txt', () => {
  it('is served as plain text on the request host', async () => {
    const env = { ...createLookupTestEnv(), PUBLIC_API_HOSTS: 'lookup.test' } as never;
    const response = await fetchLookup(env, '/llms.txt');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/plain');
    expect(await response.text()).toContain(`${ORIGIN}/docs/agents.md`);
  });

  it('serves the full document at /llms-full.txt', async () => {
    const env = { ...createLookupTestEnv(), PUBLIC_API_HOSTS: 'lookup.test' } as never;
    const response = await fetchLookup(env, '/llms-full.txt');

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('# CanCoder for AI agents');
  });
});
