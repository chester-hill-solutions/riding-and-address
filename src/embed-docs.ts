/**
 * Standalone documentation page for the drop-in autocomplete widget (`GET /embed.js`).
 * Served at `/docs/embed`; mirrors docs/oda-geolocation-contract.md. The attribute and event tables
 * are generated from the contract exported by src/embed.ts, not hand-maintained here.
 */

import { EMBED_EVENTS, EMBED_SCRIPT_ATTRIBUTES, EMBED_VERSION } from './embed';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** For text nodes inside <code>/<pre>: quotes are safe there, and escaping them hurts copy-paste. */
function escapeCode(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Prose for each attribute/event, keyed by the contract in `src/embed.ts`. Keying the maps by the
 * exported union means adding an attribute there is a type error until it is described here.
 */
const SCRIPT_ATTRIBUTE_DESCRIPTIONS: Record<(typeof EMBED_SCRIPT_ATTRIBUTES)[number], string> = {
  'data-auto':
    'Set to <code>false</code> to disable auto-attach and wire forms yourself with the JavaScript API.',
  'data-key':
    'Public browser key (<code>pk_…</code>). Required when browser keys are enabled; pairs with an origin allowlist and a daily cap.',
  'data-province': 'Restrict suggestions to a province/territory code (for example <code>ON</code>).',
  'data-limit': 'Maximum suggestions to request per keystroke. Defaults to the API default.',
  'data-include-province':
    'Set to <code>true</code> to resolve the riding as well as the address (uses <code>/api/combined</code>).',
  'data-demo':
    'Set to <code>true</code> to resolve via the keyless <code>/api/demo/*</code> tier — intended for marketing try-its, not production.',
  'data-endpoint': 'Override the API origin the widget calls. Defaults to the script’s own origin.',
  'data-theme':
    'Force <code>light</code> or <code>dark</code>. Omit to follow the operating-system preference.',
};

const EVENT_DETAILS: Record<(typeof EMBED_EVENTS)[number], string> = {
  'ridinglookup:select': 'The chosen suggestion, fired for containers and addresses alike.',
  'ridinglookup:riding': '{ riding, properties, provinceData, point, suggestion }',
  'ridinglookup:error': '{ error }',
};

export function createEmbedDocsPage(baseUrl: string): string {
  const originRaw = baseUrl.replace(/\/$/, '');
  const origin = escapeHtml(originRaw);
  const originCode = escapeCode(originRaw);
  const scriptTag = `<script src="${originRaw}/embed.js" data-province="ON" defer></script>`;

  const attributeRows = EMBED_SCRIPT_ATTRIBUTES.map(
    (attribute) =>
      `<tr><th scope="row"><code>${attribute}</code></th><td>${SCRIPT_ATTRIBUTE_DESCRIPTIONS[attribute]}</td></tr>`
  ).join('\n              ');

  const eventRows = EMBED_EVENTS.map(
    (name) =>
      `<tr><th scope="row"><code>${name}</code></th><td>${escapeHtml(EVENT_DETAILS[name])}</td></tr>`
  ).join('\n              ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="Install the CanCoder address autocomplete widget: one script tag wires Canadian address search into an existing form.">
  <title>Autocomplete widget · CanCoder docs</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600;700;800&family=Source+Serif+4:opsz,wght@8..60,600;8..60;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #eef3f8;
      --surface: #ffffff;
      --surface-subtle: #e4ebf4;
      --text: #132033;
      --muted: #5a687c;
      --primary: #1457a6;
      --primary-strong: #0c4488;
      --border: #d0dbe8;
      --radius-sm: 6px;
      --radius-md: 10px;
      --font-sans: "Source Sans 3", ui-sans-serif, system-ui, sans-serif;
      --font-display: "Source Serif 4", Georgia, serif;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      min-height: 100vh;
      background: var(--bg);
      color: var(--text);
      font-family: var(--font-sans);
      line-height: 1.55;
    }
    h1, h2, h3 { line-height: 1.15; letter-spacing: -0.025em; }
    h1, h2 { font-family: var(--font-display); font-weight: 700; }
    h1 { font-size: clamp(1.9rem, 4vw, 2.6rem); }
    h2 { font-size: 1.45rem; margin-top: 2.4rem; }
    h3 { font-size: 1.05rem; margin-top: 1.6rem; }
    p, ul, ol { margin-top: 0.75rem; }
    ul, ol { padding-left: 1.35rem; }
    li { margin-top: 0.3rem; }
    a { color: var(--primary); }
    a:hover { color: var(--primary-strong); }
    :focus-visible { outline: 3px solid #f3b61f; outline-offset: 3px; border-radius: var(--radius-sm); }
    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 0.9em;
      background: var(--surface-subtle);
      border-radius: 4px;
      padding: 0.1em 0.35em;
    }
    pre {
      margin-top: 0.9rem;
      background: #0f1b2d;
      color: #e8eef7;
      border-radius: var(--radius-md);
      padding: 1rem 1.15rem;
      overflow-x: auto;
    }
    pre code { background: none; color: inherit; padding: 0; }
    table {
      width: 100%;
      margin-top: 0.9rem;
      border-collapse: collapse;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      overflow: hidden;
    }
    th, td { text-align: left; vertical-align: top; padding: 0.7rem 0.9rem; border-bottom: 1px solid var(--border); }
    tbody tr:last-child th, tbody tr:last-child td { border-bottom: 0; }
    thead th { background: var(--surface-subtle); }
    .shell { width: min(820px, calc(100% - 2.5rem)); margin-inline: auto; padding-block: 3rem 4.5rem; }
    .back { display: inline-block; margin-bottom: 1.5rem; font-weight: 600; text-decoration: none; }
    .lede { color: var(--muted); font-size: 1.08rem; margin-top: 0.9rem; }
    .badge {
      display: inline-block;
      margin-top: 0.9rem;
      background: var(--surface-subtle);
      color: var(--muted);
      border-radius: 999px;
      padding: 0.15rem 0.7rem;
      font-size: 0.8rem;
      font-weight: 600;
    }
    .note {
      margin-top: 1rem;
      background: var(--surface);
      border: 1px solid var(--border);
      border-left: 3px solid var(--primary);
      border-radius: var(--radius-sm);
      padding: 0.85rem 1rem;
    }
  </style>
</head>
<body>
  <main class="shell">
    <a class="back" href="${origin}/docs">← API reference</a>
    <h1>Address autocomplete widget</h1>
    <p class="lede">One script tag wires Canadian address search into an existing form. It finds the
      address field, fills the address on selection, and emits the riding. The widget calls
      <code>/api/search</code>, which must be enabled on this deployment.</p>
    <span class="badge">Widget v${escapeHtml(EMBED_VERSION)}</span>

    <h2>Quick start</h2>
    <pre><code>${escapeCode(scriptTag)}</code></pre>
    <p>That is the whole integration. On load the widget finds the address field in each
      <code>&lt;form&gt;</code>, attaches, and handles the rest.</p>

    <h2>Script tag attributes</h2>
    <table>
      <thead><tr><th scope="col">Attribute</th><th scope="col">Effect</th></tr></thead>
      <tbody>
              ${attributeRows}
      </tbody>
    </table>

    <h2>Field detection</h2>
    <p>The standard <code>autocomplete</code> attribute wins, since it is an explicit statement of
      intent; otherwise <code>name</code>/<code>id</code>/<code>placeholder</code>/<code>aria-label</code>/<code>&lt;label&gt;</code>
      are matched against per-field patterns. Detection is deliberately conservative: it skips
      <code>address-line2</code>, unit/apt, country, and email fields, and matches on word boundaries
      so <code>prov</code> matches but <code>improve</code> does not.</p>
    <p>Filling works on React/Vue controlled inputs: values are written through the prototype setter
      and followed by real <code>input</code>/<code>change</code> events, so framework state actually
      updates instead of silently reverting. A province <code>&lt;select&gt;</code> is matched on
      either the code (<code>ON</code>) or the full name (<code>Ontario</code>).</p>

    <h2>JavaScript API</h2>
    <p>For forms detection cannot read, attach explicitly:</p>
    <pre><code>const widget = RidingLookup.attach({
  form: '#checkout',
  input: '#addr1',                 // optional; auto-detected within \`form\`
  fields: {                        // any of these override detection
    city: '#city', province: '#prov', postal: '#pc',
    riding: '#riding_hidden'       // not auto-detected: bind it to have the riding written in
  },
  province: 'ON',
  includeProvince: false,          // true -&gt; resolve via /api/combined
  demo: false,                     // true -&gt; resolve via /api/demo/* (keyless; marketing)
  fill: true,                      // false -&gt; emit events only, touch nothing
  locationBias: { lat: 43.65, lon: -79.38 },
  onSelect(s) {}, onRiding(r) {}, onError(e) {}
});
widget.destroy();                  // restores the field exactly as found</code></pre>

    <h2>Events</h2>
    <p>Events bubble from the input, so one delegated listener covers every form on the page.</p>
    <table>
      <thead><tr><th scope="col">Event</th><th scope="col"><code>detail</code></th></tr></thead>
      <tbody>
              ${eventRows}
      </tbody>
    </table>
    <pre><code>document.addEventListener('ridinglookup:riding', (e) =&gt; {
  console.log(e.detail.riding); // "Toronto Centre"
});</code></pre>

    <h2>Behaviour worth knowing</h2>
    <ul>
      <li>Selecting a street container does not close the dropdown — it drills into that street and
        keeps searching within it.</li>
      <li>Requests are debounced (150&nbsp;ms) and superseded ones are aborted, so a slow early
        keystroke can never overwrite a later result.</li>
      <li>The dropdown renders in a shadow root, so host-page CSS cannot break it.</li>
    </ul>

    <h2>Authentication</h2>
    <p>The widget runs in a browser, so it cannot hold a secret. Use a public <strong>browser
      key</strong> (<code>pk_…</code>), which pairs with a server-enforced origin allowlist and a
      daily cap:</p>
    <pre><code>&lt;script src="${originCode}/embed.js" data-key="pk_live_…" defer&gt;&lt;/script&gt;</code></pre>
    <div class="note">
      <p>Your backend should keep calling the API with <code>BASIC_AUTH</code> (or a server key):
        that credential is not origin-restricted and not daily-capped, and never belongs in a
        browser.</p>
    </div>

    <h2>See also</h2>
    <ul>
      <li><a href="${origin}/docs">API reference</a> — every endpoint, parameter, and error code.</li>
      <li><a href="${origin}/api/docs">OpenAPI document</a> — machine-readable spec.</li>
    </ul>
  </main>
</body>
</html>`;
}
