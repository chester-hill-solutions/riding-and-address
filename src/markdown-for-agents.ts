/**
 * Markdown for Agents, implemented here rather than as a Cloudflare zone toggle.
 *
 * A client that asks for markdown — `Accept: text/markdown` — gets a markdown rendering of the HTML
 * page it would otherwise receive; browsers, which never ask, keep getting HTML. This is content
 * negotiation on one source of truth, not a second set of pages to keep in step.
 *
 * Only an *explicit* `text/markdown` triggers it. A wildcard, which every browser sends, does not,
 * so no browser is accidentally served markdown.
 *
 * Scope: the converter handles the constructs these pages use — headings, paragraphs, lists, links,
 * images, inline and fenced code, emphasis, rules, and simple tables. It is deliberately not a full
 * HTML parser; anything it does not model is reduced to its text.
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  times: '×',
  copy: '©',
};

function decodeEntities(text: string): string {
  return text.replace(/&(#[xX]?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, code: string) => {
    if (/^#[xX]/.test(code)) return String.fromCodePoint(parseInt(code.slice(2), 16));
    if (code.startsWith('#')) return String.fromCodePoint(parseInt(code.slice(1), 10));
    return NAMED_ENTITIES[code] ?? match;
  });
}

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}

/** The markdown rendering of an HTML document. */
export function htmlToMarkdown(html: string): string {
  let out = html;

  // Non-content: comments, scripts, styles, and anything that is not prose.
  out = out.replace(/<!--[\s\S]*?-->/g, '');
  out = out.replace(/<(script|style|noscript|svg|template|iframe)\b[\s\S]*?<\/\1>/gi, '');
  out = out.replace(/<head\b[\s\S]*?<\/head>/gi, '');
  // Decorative content marked aria-hidden (icon glyphs, brand symbols) is not prose.
  out = out.replace(/<([a-z0-9]+)\b[^>]*\baria-hidden=["']true["'][^>]*>[\s\S]*?<\/\1>/gi, '');

  // Adjacent inline elements carry no whitespace in minified markup, so two spans would otherwise
  // run together ("Example lookupCanada"). A space between them is what the rendering implies.
  out = out.replace(
    /<\/(a|span|strong|em|b|i|code)>(?=<(a|span|strong|em|b|i|code)[\s>])/gi,
    '</$1> '
  );

  // Block openings need a boundary too, or a link ending a header runs straight into the next
  // section's first link. Excess newlines are collapsed at the end.
  out = out.replace(
    /<(nav|header|footer|main|section|article|div|p|ul|ol|table|dl|li|pre|blockquote|figure|h[1-6])\b/gi,
    '\n\n<$1'
  );

  // Links and images before tags are stripped, so their labels survive.
  out = out.replace(
    /<a\b[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi,
    (_match, href: string, text: string) => {
      const label = decodeEntities(stripTags(text)).replace(/\s+/g, ' ').trim();
      if (!label) return '';
      return href && href !== label ? `[${label}](${href})` : label;
    }
  );
  out = out.replace(/<img\b[^>]*alt=["']([^"']*)["'][^>]*>/gi, (_match, alt: string) =>
    alt ? `![${alt}]()` : ''
  );

  // Code: fenced blocks, then inline spans.
  out = out.replace(
    /<pre\b[^>]*>([\s\S]*?)<\/pre>/gi,
    (_match, code: string) => `\n\n\`\`\`\n${decodeEntities(stripTags(code)).trim()}\n\`\`\`\n\n`
  );
  out = out.replace(
    /<code\b[^>]*>([\s\S]*?)<\/code>/gi,
    (_match, code: string) => `\`${decodeEntities(stripTags(code)).trim()}\``
  );

  // Emphasis.
  out = out.replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_m, _t, text: string) =>
    `**${decodeEntities(stripTags(text)).trim()}**`
  );
  out = out.replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_m, _t, text: string) =>
    `*${decodeEntities(stripTags(text)).trim()}*`
  );

  // Headings, deepest first so h1 does not match inside h10 (there is no h10, but the ordering is
  // what keeps the replacement deterministic). A <br> inside a heading is a line break in the
  // rendered title, so it becomes a space rather than being swallowed.
  for (let level = 6; level >= 1; level -= 1) {
    out = out.replace(
      new RegExp(`<h${level}\\b[^>]*>([\\s\\S]*?)<\\/h${level}>`, 'gi'),
      (_m, text: string) =>
        `\n\n${'#'.repeat(level)} ${decodeEntities(stripTags(text.replace(/<br\s*\/?>/gi, ' ')))
          .replace(/\s+/g, ' ')
          .trim()}\n\n`
    );
  }

  // Lists. Ordered lists keep their markers only as a hint; the items are what matter.
  out = out.replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (_m, text: string) => {
    const label = decodeEntities(stripTags(text)).replace(/\s+/g, ' ').trim();
    return label ? `\n- ${label}` : '';
  });

  // Simple tables: cells become pipe-separated, rows become lines.
  out = out.replace(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi, (_m, text: string) => {
    const cell = decodeEntities(stripTags(text)).replace(/\s+/g, ' ').trim();
    return ` | ${cell}`;
  });

  // Block boundaries.
  out = out.replace(
    /<\/(p|div|section|article|header|footer|main|ul|ol|table|tr|blockquote|figure)>/gi,
    '\n\n'
  );
  out = out.replace(/<br\s*\/?>/gi, '\n');
  out = out.replace(/<hr\s*\/?>/gi, '\n\n---\n\n');

  // Everything left is text.
  out = decodeEntities(stripTags(out));

  // Normalise: non-breaking spaces become ordinary ones, then collapse runs of spaces, blank
  // lines, and stray leading space.
  return (
    out
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .split('\n')
      .map((line) => line.replace(/\s+$/, '').replace(/^\s+/, (lead) => (lead.length > 1 ? ' ' : lead)))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim() + '\n'
  );
}

interface MediaRange {
  type: string;
  q: number;
}

function parseMediaRange(value: string): MediaRange | null {
  const [type, ...params] = value.split(';').map((part) => part.trim().toLowerCase());
  if (!type) return null;
  const qParam = params.find((param) => param.startsWith('q='));
  const q = qParam ? Number(qParam.slice(2)) : 1;
  return { type, q: Number.isFinite(q) ? q : 0 };
}

/**
 * True only when the client *explicitly* asks for markdown and does not prefer HTML more.
 * A wildcard never counts: browsers send a wildcard Accept, and serving them markdown would be a bug.
 */
export function wantsMarkdown(request: Request): boolean {
  const accept = request.headers.get('Accept');
  if (!accept) return false;

  const ranges = accept
    .split(',')
    .map(parseMediaRange)
    .filter((range): range is MediaRange => range !== null);

  const markdown = ranges
    .filter((range) => range.type === 'text/markdown' || range.type === 'text/x-markdown')
    .reduce<MediaRange | null>((best, range) => (!best || range.q > best.q ? range : best), null);
  if (!markdown || markdown.q <= 0) return false;

  const html = ranges
    .filter((range) => range.type === 'text/html' || range.type === 'application/xhtml+xml')
    .reduce<MediaRange | null>((best, range) => (!best || range.q > best.q ? range : best), null);

  return !html || markdown.q >= html.q;
}

/** Rough token count for `x-markdown-tokens`; the convention is ~4 characters per token. */
export function estimateTokens(markdown: string): number {
  return Math.ceil(markdown.length / 4);
}

function appendVary(existing: string | null, value: string): string {
  if (!existing) return value;
  const parts = existing.split(',').map((part) => part.trim().toLowerCase());
  return parts.includes(value.toLowerCase()) ? existing : `${existing}, ${value}`;
}

/**
 * Apply negotiation to a response: HTML pages become markdown when asked for, everything else is
 * returned untouched. Non-GET and non-200 responses are never converted, so redirects and errors
 * keep their own semantics.
 */
export async function negotiateMarkdown(request: Request, response: Response): Promise<Response> {
  if (request.method !== 'GET') return response;
  if (response.status !== 200) return response;
  if (!wantsMarkdown(request)) return response;

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('text/html')) return response;

  const markdown = htmlToMarkdown(await response.text());
  const headers = new Headers(response.headers);
  headers.set('content-type', 'text/markdown; charset=utf-8');
  headers.set('vary', appendVary(headers.get('vary'), 'Accept'));
  headers.set('x-markdown-tokens', String(estimateTokens(markdown)));
  return new Response(markdown, { status: 200, headers });
}
