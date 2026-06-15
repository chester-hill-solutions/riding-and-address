import { PROVINCIAL_DATASETS } from './datasets';

export function createLandingPage(baseUrl: string): string {
  const endpointOptions = PROVINCIAL_DATASETS.map(
    d => `<option value="${d.path}">${d.path} — ${d.name} provincial (${d.year}, ${d.status})</option>`
  ).join('\n              ');
  const pillOptions = PROVINCIAL_DATASETS.map(
    d => `<span class="pill"><strong>${d.code.toUpperCase()}</strong> ${d.year} ${d.status}</span>`
  ).join('\n          ');
  const routeOptions = PROVINCIAL_DATASETS.map(
    d => `<a class="route" href="${baseUrl}/docs">
        <span class="method">GET</span>
        <span class="route-path">${d.path}</span>
        <span class="route-desc">${d.name} provincial riding lookup</span>
      </a>`
  ).join('\n      ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="Find Canadian federal and provincial electoral ridings by postal code, address, or coordinates.">
  <title>Riding Lookup API</title>
  <style>
    :root {
      --bg: #f4f6f8;
      --surface: #ffffff;
      --text: #0f172a;
      --muted: #64748b;
      --border: #e2e8f0;
      --accent: #b91c1c;
      --accent-hover: #991b1b;
      --accent-soft: #fef2f2;
      --code-bg: #0f172a;
      --code-text: #e2e8f0;
      --success: #15803d;
      --radius: 12px;
      --shadow: 0 1px 2px rgba(15, 23, 42, 0.06), 0 8px 24px rgba(15, 23, 42, 0.06);
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      line-height: 1.6;
      color: var(--text);
      background: var(--bg);
      font-size: 16px;
    }

    a { color: inherit; }

    .nav {
      position: sticky;
      top: 0;
      z-index: 10;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 14px 24px;
      background: rgba(255, 255, 255, 0.92);
      border-bottom: 1px solid var(--border);
      backdrop-filter: blur(10px);
    }

    .brand {
      font-weight: 700;
      font-size: 15px;
      letter-spacing: -0.02em;
      text-decoration: none;
    }

    .nav-links {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }

    .nav-links a {
      text-decoration: none;
      color: var(--muted);
      font-size: 14px;
      font-weight: 500;
    }

    .nav-links a:hover { color: var(--text); }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 10px 18px;
      border-radius: 999px;
      font-size: 14px;
      font-weight: 600;
      text-decoration: none;
      border: 1px solid transparent;
      cursor: pointer;
      transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
    }

    .btn-primary {
      background: var(--accent);
      color: #fff;
    }

    .btn-primary:hover { background: var(--accent-hover); }

    .btn-secondary {
      background: var(--surface);
      color: var(--text);
      border-color: var(--border);
    }

    .btn-secondary:hover { background: #f8fafc; }

    .hero {
      max-width: 1100px;
      margin: 0 auto;
      padding: 56px 24px 32px;
    }

    .hero-grid {
      display: grid;
      grid-template-columns: 1.1fr 0.9fr;
      gap: 32px;
      align-items: start;
    }

    .eyebrow {
      display: inline-block;
      margin-bottom: 14px;
      padding: 6px 12px;
      border-radius: 999px;
      background: var(--accent-soft);
      color: var(--accent);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    h1 {
      font-size: clamp(2rem, 4vw, 3rem);
      line-height: 1.08;
      letter-spacing: -0.03em;
      margin-bottom: 16px;
    }

    .lead {
      font-size: 18px;
      color: var(--muted);
      max-width: 54ch;
      margin-bottom: 28px;
    }

    .hero-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-bottom: 28px;
    }

    .hero-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }

    .pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border-radius: 999px;
      background: var(--surface);
      border: 1px solid var(--border);
      font-size: 13px;
      color: var(--muted);
    }

    .pill strong { color: var(--text); }

    .panel {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      overflow: hidden;
    }

    .panel-header {
      padding: 16px 18px;
      border-bottom: 1px solid var(--border);
      font-size: 14px;
      font-weight: 600;
    }

    .try-form {
      padding: 18px;
      display: grid;
      gap: 12px;
    }

    .try-row {
      display: grid;
      grid-template-columns: 120px 1fr;
      gap: 10px;
      align-items: center;
    }

    label {
      font-size: 13px;
      font-weight: 600;
      color: var(--muted);
    }

    select, input {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid var(--border);
      border-radius: 8px;
      font: inherit;
      background: #fff;
    }

    select:focus, input:focus {
      outline: 2px solid rgba(185, 28, 28, 0.25);
      border-color: var(--accent);
    }

    .try-actions {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      padding: 0 18px 18px;
    }

    .try-output {
      border-top: 1px solid var(--border);
      background: var(--code-bg);
      color: var(--code-text);
      min-height: 180px;
      max-height: 320px;
      overflow: auto;
      padding: 16px 18px;
      font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, monospace;
      font-size: 13px;
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .try-status {
      padding: 10px 18px;
      border-top: 1px solid var(--border);
      font-size: 13px;
      color: var(--muted);
      display: none;
    }

    .try-status.visible { display: block; }
    .try-status.ok { color: var(--success); }
    .try-status.error { color: var(--accent); }

    .section {
      max-width: 1100px;
      margin: 0 auto;
      padding: 16px 24px 48px;
    }

    .section h2 {
      font-size: 22px;
      letter-spacing: -0.02em;
      margin-bottom: 18px;
    }

    .cards {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
    }

    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 20px;
      box-shadow: var(--shadow);
    }

    .card h3 {
      font-size: 16px;
      margin-bottom: 8px;
    }

    .card p {
      font-size: 14px;
      color: var(--muted);
    }

    .routes {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      overflow: hidden;
      box-shadow: var(--shadow);
    }

    .route {
      display: grid;
      grid-template-columns: 88px 180px 1fr;
      gap: 16px;
      align-items: center;
      padding: 14px 18px;
      border-bottom: 1px solid var(--border);
      text-decoration: none;
      color: inherit;
      transition: background 0.15s ease;
    }

    .route:last-child { border-bottom: none; }
    .route:hover { background: #f8fafc; }

    .method {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 6px;
      background: #ecfdf5;
      color: #047857;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-align: center;
    }

    .method.post {
      background: #eff6ff;
      color: #1d4ed8;
    }

    .route-path {
      font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, monospace;
      font-size: 14px;
      font-weight: 600;
    }

    .route-desc {
      font-size: 14px;
      color: var(--muted);
    }

    .code-block {
      margin-top: 24px;
      background: var(--code-bg);
      color: var(--code-text);
      border-radius: var(--radius);
      padding: 18px 20px;
      overflow-x: auto;
      font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, monospace;
      font-size: 13px;
      line-height: 1.6;
      box-shadow: var(--shadow);
    }

    .footer {
      max-width: 1100px;
      margin: 0 auto;
      padding: 24px 24px 48px;
      display: flex;
      flex-wrap: wrap;
      gap: 16px 24px;
      border-top: 1px solid var(--border);
      color: var(--muted);
      font-size: 14px;
    }

    .footer a {
      color: var(--text);
      text-decoration: none;
      font-weight: 500;
    }

    .footer a:hover { color: var(--accent); }

    @media (max-width: 900px) {
      .hero-grid, .cards { grid-template-columns: 1fr; }
      .route {
        grid-template-columns: 1fr;
        gap: 8px;
      }
      .try-row { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <nav class="nav">
    <a class="brand" href="${baseUrl}/">Riding Lookup</a>
    <div class="nav-links">
      <a href="${baseUrl}/health">Health</a>
      <a href="https://github.com/wra-sol/ridingLookup/tree/main/docs">Guides</a>
      <a href="${baseUrl}/api/docs">OpenAPI</a>
      <a class="btn btn-primary" href="${baseUrl}/docs">API Reference</a>
    </div>
  </nav>

  <header class="hero">
    <div class="hero-grid">
      <div>
        <span class="eyebrow">Canadian electoral districts</span>
        <h1>Look up federal and provincial ridings from any address in Canada</h1>
        <p class="lead">
          Resolve a postal code, street address, or coordinates to riding metadata.
          Built on Cloudflare Workers with optional ODA self-hosted geocoding.
        </p>
        <div class="hero-actions">
          <a class="btn btn-primary" href="${baseUrl}/docs">Browse API reference</a>
          <a class="btn btn-secondary" href="https://github.com/wra-sol/ridingLookup">View on GitHub</a>
        </div>
        <div class="hero-meta">
          <span class="pill"><strong>Federal</strong> 2024 boundaries</span>
          ${pillOptions}
          <span class="pill"><strong>ODA</strong> geocoding optional</span>
        </div>
      </div>

      <div class="panel">
        <div class="panel-header">Try a lookup</div>
        <form class="try-form" id="try-form">
          <div class="try-row">
            <label for="try-endpoint">Endpoint</label>
            <select id="try-endpoint" name="endpoint">
              <option value="/api">/api — Federal</option>
              <option value="/api/combined">/api/combined — Federal + provincial</option>
              ${endpointOptions}
            </select>
          </div>
          <div class="try-row">
            <label for="try-mode">Input</label>
            <select id="try-mode" name="mode">
              <option value="postal">Postal code</option>
              <option value="address">Address</option>
              <option value="coordinates">Coordinates</option>
            </select>
          </div>
          <div class="try-row" id="try-input-row">
            <label for="try-input" id="try-input-label">Postal code</label>
            <input id="try-input" name="postal" value="K1A 0A6" autocomplete="off" spellcheck="false">
          </div>
          <div class="try-row" id="try-coord-row" hidden>
            <label for="try-lon">Longitude</label>
            <input id="try-lon" name="lon" value="-75.6972" autocomplete="off">
          </div>
          <div class="try-row" id="try-lat-row" hidden>
            <label for="try-lat">Latitude</label>
            <input id="try-lat" name="lat" value="45.4215" autocomplete="off">
          </div>
        </form>
        <div class="try-actions">
          <button class="btn btn-primary" type="submit" form="try-form">Run lookup</button>
          <button class="btn btn-secondary" type="button" id="try-copy">Copy curl</button>
        </div>
        <div class="try-status" id="try-status"></div>
        <pre class="try-output" id="try-output">// Response will appear here</pre>
      </div>
    </div>
  </header>

  <section class="section">
    <h2>What you get</h2>
    <div class="cards">
      <article class="card">
        <h3>Location to riding</h3>
        <p>Postal codes, addresses, and lat/lon resolve to federal riding properties such as <code>FED_NUM</code> and <code>FED_NAME</code>.</p>
      </article>
      <article class="card">
        <h3>Provincial enrichment</h3>
        <p>Use <code>/api/combined</code> or <code>include_province=true</code> to attach matching provincial results for any supported province.</p>
      </article>
      <article class="card">
        <h3>Fast repeat lookups</h3>
        <p>Warm KV caches deliver sub-10ms responses for cached coordinates and postcodes at the edge.</p>
      </article>
    </div>
  </section>

  <section class="section">
    <h2>Core endpoints</h2>
    <div class="routes">
      <a class="route" href="${baseUrl}/docs">
        <span class="method">GET</span>
        <span class="route-path">/api</span>
        <span class="route-desc">Federal riding lookup by postal, address, or coordinates</span>
      </a>
      <a class="route" href="${baseUrl}/docs">
        <span class="method">GET</span>
        <span class="route-path">/api/combined</span>
        <span class="route-desc">Federal plus provincial riding in one response</span>
      </a>
      ${routeOptions}
      <a class="route" href="${baseUrl}/docs">
        <span class="method">GET</span>
        <span class="route-path">/api/geocode</span>
        <span class="route-desc">Forward geocode via ODA when self-hosted geocoding is enabled</span>
      </a>
      <a class="route" href="${baseUrl}/docs">
        <span class="method post">POST</span>
        <span class="route-path">/batch</span>
        <span class="route-desc">Process up to 100 lookups in a single request</span>
      </a>
    </div>

    <pre class="code-block">curl "${baseUrl}/api/combined?postal=K1A%200A6&amp;include_province=true&amp;return=municipality"</pre>
  </section>

  <footer class="footer">
    <a href="${baseUrl}/docs">API reference</a>
    <a href="${baseUrl}/api/docs">OpenAPI JSON</a>
    <a href="${baseUrl}/health">Health check</a>
    <a href="https://github.com/wra-sol/ridingLookup/tree/main/docs">Markdown guides</a>
    <a href="https://github.com/wra-sol/ridingLookup">GitHub repository</a>
  </footer>

  <script>
    (function () {
      const baseUrl = ${JSON.stringify(baseUrl)};
      const form = document.getElementById('try-form');
      const modeSelect = document.getElementById('try-mode');
      const endpointSelect = document.getElementById('try-endpoint');
      const inputRow = document.getElementById('try-input-row');
      const coordRow = document.getElementById('try-coord-row');
      const latRow = document.getElementById('try-lat-row');
      const inputLabel = document.getElementById('try-input-label');
      const input = document.getElementById('try-input');
      const lonInput = document.getElementById('try-lon');
      const latInput = document.getElementById('try-lat');
      const output = document.getElementById('try-output');
      const status = document.getElementById('try-status');
      const copyButton = document.getElementById('try-copy');

      function setStatus(message, kind) {
        status.textContent = message;
        status.className = 'try-status visible' + (kind ? ' ' + kind : '');
      }

      function syncModeUi() {
        const mode = modeSelect.value;
        const isCoords = mode === 'coordinates';
        inputRow.hidden = isCoords;
        coordRow.hidden = !isCoords;
        latRow.hidden = !isCoords;
        input.disabled = false;
        lonInput.disabled = !isCoords;
        latInput.disabled = !isCoords;

        if (mode === 'postal') {
          inputLabel.textContent = 'Postal code';
          input.placeholder = 'K1A 0A6';
        } else if (mode === 'address') {
          inputLabel.textContent = 'Address';
          input.placeholder = '123 Main St, Toronto, ON';
        }
      }

      function buildQuery() {
        const params = new URLSearchParams();
        const mode = modeSelect.value;

        if (mode === 'postal') {
          const postal = input.value.trim();
          if (!postal) {
            return null;
          }
          params.set('postal', postal);
        } else if (mode === 'address') {
          const address = input.value.trim();
          if (!address) {
            return null;
          }
          params.set('address', address);
        } else {
          const lat = latInput.value.trim();
          const lon = lonInput.value.trim();
          if (!lat || !lon) {
            return null;
          }
          params.set('lat', lat);
          params.set('lon', lon);
        }

        if (endpointSelect.value === '/api/combined') {
          params.set('include_province', 'true');
        }

        return params;
      }

      function buildUrl() {
        const endpoint = endpointSelect.value;
        const params = buildQuery();
        if (!params) {
          return null;
        }
        return baseUrl + endpoint + '?' + params.toString();
      }

      function buildCurl() {
        const url = buildUrl();
        return url ? 'curl "' + url + '"' : '';
      }

      modeSelect.addEventListener('change', syncModeUi);
      syncModeUi();

      copyButton.addEventListener('click', async function () {
        const curl = buildCurl();
        if (!curl) {
          setStatus('Enter a postal code, address, or coordinates first.', 'error');
          return;
        }
        try {
          await navigator.clipboard.writeText(curl);
          setStatus('Copied curl command to clipboard.', 'ok');
        } catch (_error) {
          setStatus(curl, 'ok');
        }
      });

      form.addEventListener('submit', async function (event) {
        event.preventDefault();
        const url = buildUrl();
        if (!url) {
          output.textContent = '// Enter a postal code, address, or both coordinates';
          setStatus('At least one location parameter is required.', 'error');
          return;
        }
        output.textContent = 'Loading...';
        setStatus('Requesting ' + url, '');

        const started = performance.now();
        try {
          const response = await fetch(url, { headers: { Accept: 'application/json' } });
          const data = await response.json();
          const elapsed = Math.round(performance.now() - started);
          output.textContent = JSON.stringify(data, null, 2);
          setStatus(
            (response.ok ? 'HTTP ' + response.status : 'HTTP ' + response.status + ' error') +
              ' \u00b7 ' + elapsed + 'ms',
            response.ok ? 'ok' : 'error'
          );
        } catch (error) {
          output.textContent = String(error);
          setStatus('Request failed', 'error');
        }
      });
    })();
  </script>
</body>
</html>`;
}
