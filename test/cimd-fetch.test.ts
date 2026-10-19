import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CIMD_MAX_BYTES,
  CIMD_MAX_RESOURCE_BYTES,
  fetchClientMetadataResource,
  isSpecialUseHost,
} from '../src/cimd-fetch';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('isSpecialUseHost', () => {
  it('refuses loopback, private, link-local and reserved IPv4', () => {
    for (const host of [
      '127.0.0.1',
      '127.1.2.3',
      '10.0.0.1',
      '172.16.0.1',
      '172.31.255.254',
      '192.168.1.1',
      '169.254.169.254', // the cloud metadata address
      '100.64.0.1', // CGNAT
      '198.18.0.1', // benchmarking
      '224.0.0.1', // multicast
      '0.0.0.0',
      '255.255.255.255',
    ]) {
      expect(`${host}: ${isSpecialUseHost(host)}`).toBe(`${host}: true`);
    }
  });

  it('refuses loopback, unique-local, link-local and IPv4-mapped IPv6', () => {
    for (const host of ['::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1', '::ffff:127.0.0.1']) {
      expect(`${host}: ${isSpecialUseHost(host)}`).toBe(`${host}: true`);
    }
  });

  it('refuses the names that mean the local network', () => {
    for (const host of ['localhost', 'app.localhost', 'printer.local', 'metadata.internal']) {
      expect(`${host}: ${isSpecialUseHost(host)}`).toBe(`${host}: true`);
    }
  });

  it('allows ordinary public hosts, including ones that merely look numeric', () => {
    for (const host of ['example.com', 'client.example.co.uk', '172.32.0.1', '11.0.0.1', '2606:4700::1']) {
      expect(`${host}: ${isSpecialUseHost(host)}`).toBe(`${host}: false`);
    }
  });
});

describe('fetchClientMetadataResource', () => {
  let calls: Array<{ url: string; init: RequestInit | undefined }>;

  beforeEach(() => {
    calls = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify({ client_id: String(input) }), {
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;
  });

  it('fetches an ordinary HTTPS document', async () => {
    const response = await fetchClientMetadataResource('https://client.example/metadata.json');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ client_id: 'https://client.example/metadata.json' });
  });

  it('refuses a non-HTTPS scheme before making any request', async () => {
    // A document fetched over http is one anyone on the path can rewrite — and the client_id it
    // carries becomes a client identity.
    await expect(fetchClientMetadataResource('http://client.example/metadata.json')).rejects.toThrow(
      /HTTPS/
    );
    expect(calls).toHaveLength(0);
  });

  it('refuses a special-use address before making any request', async () => {
    await expect(
      fetchClientMetadataResource('https://169.254.169.254/latest/meta-data/')
    ).rejects.toThrow(/special-use/);
    expect(calls).toHaveLength(0);
  });

  it('tells fetch not to follow redirects, and refuses one if it comes back', async () => {
    // Following a redirect would let the document arrive from somewhere other than the URL that
    // identifies the client — and the URL *is* the identity.
    //
    // `manual` rather than `error` because the Workers runtime REJECTS `error` outright: it throws
    // "Invalid redirect value" before the request leaves the isolate, so every fetch failed and the
    // library reported a network error. Bun accepts `error`, so only a live deployment showed it.
    await fetchClientMetadataResource('https://client.example/metadata.json');
    expect(calls[0]?.init?.redirect).toBe('manual');
  });

  it('refuses a response that is a redirect', async () => {
    globalThis.fetch = (async () =>
      new Response(null, { status: 302, headers: { location: 'https://169.254.169.254/' } })) as typeof fetch;
    await expect(
      fetchClientMetadataResource('https://client.example/metadata.json')
    ).rejects.toThrow(/redirect/);
  });

  it('refuses a JSON document over the cap the draft sets, rather than reading it', async () => {
    globalThis.fetch = (async () =>
      new Response('x'.repeat(CIMD_MAX_BYTES + 1), {
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch;
    await expect(fetchClientMetadataResource('https://client.example/big.json')).rejects.toThrow(
      /exceeds/
    );
  });

  it('accepts a document exactly at the cap', async () => {
    globalThis.fetch = (async () =>
      new Response('x'.repeat(CIMD_MAX_BYTES), {
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch;
    const response = await fetchClientMetadataResource('https://client.example/big.json');
    expect((await response.text()).length).toBe(CIMD_MAX_BYTES);
  });

  it('does NOT apply the document cap to the other resources the library fetches', async () => {
    // The bug a real client found. The draft's 5 KB is the limit for the metadata DOCUMENT; the
    // library uses one transport for that and for the resources it names. Applying the document's cap
    // to everything refused OpenCode's 7 KB logo and failed the whole client resolution — with a
    // message about a network error, which says nothing about a size limit.
    globalThis.fetch = (async () =>
      new Response('x'.repeat(CIMD_MAX_BYTES + 1), {
        headers: { 'content-type': 'image/png' },
      })) as typeof fetch;
    const response = await fetchClientMetadataResource('https://client.example/logo.png');
    expect((await response.text()).length).toBe(CIMD_MAX_BYTES + 1);
  });

  it('still bounds a resource that is not a document', async () => {
    // A bound, not a policy: these are client-controlled too.
    globalThis.fetch = (async () =>
      new Response('x'.repeat(CIMD_MAX_RESOURCE_BYTES + 1), {
        headers: { 'content-type': 'image/png' },
      })) as typeof fetch;
    await expect(fetchClientMetadataResource('https://client.example/huge.png')).rejects.toThrow(
      /exceeds/
    );
  });

  it('treats an AS-defined +json content type as a document', async () => {
    // The draft allows a more specific type, and it is still the document.
    globalThis.fetch = (async () =>
      new Response('x'.repeat(CIMD_MAX_BYTES + 1), {
        headers: { 'content-type': 'application/client-metadata+json' },
      })) as typeof fetch;
    await expect(fetchClientMetadataResource('https://client.example/meta')).rejects.toThrow(
      /exceeds/
    );
  });

  it('fails closed when the fetch itself fails', async () => {
    globalThis.fetch = (async () => {
      throw new Error('redirect not allowed');
    }) as unknown as typeof fetch;
    await expect(fetchClientMetadataResource('https://client.example/metadata.json')).rejects.toThrow(
      /redirect not allowed/
    );
  });

  it('passes a non-2xx response through rather than inventing a document', async () => {
    globalThis.fetch = (async () => new Response('nope', { status: 404 })) as typeof fetch;
    const response = await fetchClientMetadataResource('https://client.example/metadata.json');
    expect(response.status).toBe(404);
  });
});
