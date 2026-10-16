import { describe, it, expect } from 'vitest';
import {
  estimateTokens,
  htmlToMarkdown,
  negotiateMarkdown,
  wantsMarkdown,
} from '../src/markdown-for-agents';

/**
 * Markdown for Agents is content negotiation, so the two things worth pinning are that only an
 * explicit ask triggers it (never a browser) and that the conversion is faithful enough to be
 * useful — not that it is a complete HTML parser.
 */

const request = (accept?: string) =>
  new Request('https://lookup.test/', accept ? { headers: { accept } } : {});

describe('wantsMarkdown', () => {
  it('accepts an explicit text/markdown ask', () => {
    expect(wantsMarkdown(request('text/markdown'))).toBe(true);
    expect(wantsMarkdown(request('text/markdown; charset=utf-8'))).toBe(true);
    expect(wantsMarkdown(request('text/x-markdown'))).toBe(true);
  });

  it('never triggers on a browser Accept header', () => {
    // What a browser actually sends: no markdown, and a wildcard that must not count.
    expect(
      wantsMarkdown(
        request('text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,*/*;q=0.8')
      )
    ).toBe(false);
    expect(wantsMarkdown(request('*/*'))).toBe(false);
    expect(wantsMarkdown(request())).toBe(false);
  });

  it('lets a client prefer HTML over markdown', () => {
    expect(wantsMarkdown(request('text/markdown;q=0.5,text/html'))).toBe(false);
    expect(wantsMarkdown(request('text/markdown,text/html'))).toBe(true);
  });
});

describe('htmlToMarkdown', () => {
  it('converts the constructs these pages use', () => {
    const md = htmlToMarkdown(`
      <head><title>ignored</title><style>h1{color:red}</style></head>
      <body>
        <header><a href="/">CanCoder</a></header>
        <h1>Canadian riding lookup</h1>
        <p>Resolve an address to a <strong>federal</strong> or <em>provincial</em> riding.</p>
        <h2>Routes</h2>
        <ul><li><a href="/api/federal">Federal</a></li><li>Provincial</li></ul>
        <pre><code>GET /api/federal?postal=K1A0A6</code></pre>
        <p>Use <code>postal</code> or <code>address</code>.</p>
        <hr>
        <script>alert('nope')</script>
      </body>
    `);

    expect(md).toContain('# Canadian riding lookup');
    expect(md).toContain('## Routes');
    expect(md).toContain('**federal**');
    expect(md).toContain('*provincial*');
    expect(md).toContain('[Federal](/api/federal)');
    expect(md).toContain('- Provincial');
    expect(md).toContain('```\nGET /api/federal?postal=K1A0A6\n```');
    expect(md).toContain('`postal`');
    expect(md).toContain('---');
    // Non-content is gone.
    expect(md).not.toContain('alert');
    expect(md).not.toContain('color:red');
    expect(md).not.toContain('ignored');
  });

  it('decodes entities and collapses whitespace', () => {
    const md = htmlToMarkdown('<p>Riding &amp; address &mdash;   Canada&#39;s&#160;data</p>');
    expect(md).toContain("Riding & address — Canada's data");
  });

  it('turns a simple table into pipe-separated lines', () => {
    const md = htmlToMarkdown('<table><tr><th>Field</th><th>Use</th></tr><tr><td>postal</td><td>Code</td></tr></table>');
    expect(md).toContain('| Field | Use');
    expect(md).toContain('| postal | Code');
  });
});

describe('negotiateMarkdown', () => {
  const html = () =>
    new Response('<!DOCTYPE html><html><body><h1>Home</h1><p>Hello</p></body></html>', {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });

  it('returns markdown with the right content type and token hint when asked', async () => {
    const response = await negotiateMarkdown(request('text/markdown'), html());
    expect(response.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
    expect(response.headers.get('vary')).toBe('Accept');
    expect(Number(response.headers.get('x-markdown-tokens'))).toBeGreaterThan(0);
    const body = await response.text();
    expect(body).toContain('# Home');
    expect(body).not.toContain('<h1>');
  });

  it('leaves a browser request untouched', async () => {
    const original = html();
    const response = await negotiateMarkdown(request('text/html,*/*;q=0.8'), original);
    expect(response).toBe(original);
    expect(response.headers.get('content-type')).toContain('text/html');
  });

  it('does not convert JSON, non-200, or non-GET', async () => {
    const json = new Response('{"a":1}', { headers: { 'content-type': 'application/json' } });
    expect(await negotiateMarkdown(request('text/markdown'), json)).toBe(json);

    const error = new Response('<h1>Not found</h1>', {
      status: 404,
      headers: { 'content-type': 'text/html' },
    });
    expect(await negotiateMarkdown(request('text/markdown'), error)).toBe(error);

    const post = new Request('https://lookup.test/', {
      method: 'POST',
      headers: { accept: 'text/markdown' },
    });
    const ok = html();
    expect(await negotiateMarkdown(post, ok)).toBe(ok);
  });

  it('preserves an existing Vary header', async () => {
    const response = await negotiateMarkdown(
      request('text/markdown'),
      new Response('<h1>x</h1>', {
        headers: { 'content-type': 'text/html', vary: 'Origin' },
      })
    );
    expect(response.headers.get('vary')).toBe('Origin, Accept');
  });
});

describe('estimateTokens', () => {
  it('is a quarter of the character count', () => {
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2);
  });
});
