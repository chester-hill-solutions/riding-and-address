/**
 * Public marketing landing for GET /.
 * Civic utilitarian CanCoder page — hero, live try-it, product pillars, pricing.
 */

import { PROVINCIAL_DATASETS } from './datasets';

const FREE_MONTHLY = '1,000';
const METERED_PRICE = '$0.005';

const SAMPLES = [
  { label: 'Ottawa', query: '24 Sussex Dr, Ottawa, ON', lat: 45.4445, lon: -75.6939 },
  { label: 'Toronto', query: '100 Queen St W, Toronto, ON', lat: 43.6532, lon: -79.3832 },
  { label: 'Vancouver', query: '800 Robson St, Vancouver, BC', lat: 49.2827, lon: -123.1207 },
] as const;

export function createLandingPage(baseUrl: string): string {
  const samplesJson = JSON.stringify(SAMPLES);
  const provincialLinks = PROVINCIAL_DATASETS.map(
    (d) =>
      `<a href="${baseUrl}${d.path}"><code>${d.path}</code></a>`
  ).join(' · ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="Canadian address geocoding, autocomplete, and electoral district API for campaign tools and forms.">
  <title>CanCoder</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600;700;800&family=Source+Serif+4:opsz,wght@8..60,600;8..60,700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #eef3f8;
      --surface: #ffffff;
      --surface-subtle: #e4ebf4;
      --text: #132033;
      --muted: #5a687c;
      --primary: #1457a6;
      --primary-strong: #0c4488;
      --primary-soft: #e7f0fb;
      --border: #d0dbe8;
      --border-strong: #b3c2d4;
      --success: #14733e;
      --radius-sm: 6px;
      --radius-md: 10px;
      --font-sans: "Source Sans 3", ui-sans-serif, system-ui, sans-serif;
      --font-display: "Source Serif 4", Georgia, serif;
      --hero-ink: #f4f8fc;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html { scroll-behavior: smooth; }
    body {
      min-height: 100vh;
      background: var(--bg);
      color: var(--text);
      font-family: var(--font-sans);
      line-height: 1.55;
    }
    h1, h2, h3 { line-height: 1.15; letter-spacing: -0.025em; }
    h1, h2 { font-family: var(--font-display); font-weight: 700; }
    h2 { font-size: clamp(1.65rem, 3vw, 2.35rem); font-weight: 650; }
    h3 { font-size: 1.12rem; }
    a { color: var(--primary); }
    a:hover { color: var(--primary-strong); }
    :focus-visible {
      outline: 3px solid #f3b61f;
      outline-offset: 3px;
      border-radius: var(--radius-sm);
    }
    .shell { width: min(1120px, calc(100% - 2.5rem)); margin-inline: auto; }
    .site-header {
      position: sticky; top: 0; z-index: 20;
      background: rgb(255 255 255 / 92%);
      border-bottom: 1px solid var(--border);
      backdrop-filter: blur(10px);
    }
    .nav {
      min-height: 72px;
      display: flex; gap: 2rem; align-items: center; justify-content: space-between;
    }
    .brand {
      color: var(--text);
      font-family: var(--font-display);
      font-size: 1.35rem; font-weight: 700;
      letter-spacing: -0.03em; text-decoration: none;
    }
    .nav__links { display: flex; align-items: center; gap: 1.5rem; flex-wrap: wrap; }
    .nav__links > a:not(.btn) {
      color: var(--muted); font-size: 0.93rem; font-weight: 550; text-decoration: none;
    }
    .button-row {
      display: flex; flex-wrap: wrap; gap: 0.85rem 1.25rem;
      align-items: center; margin-top: 1.35rem;
    }
    .button-row--section { margin-top: 2.5rem; }
    .btn {
      display: inline-flex; min-height: 44px; align-items: center; justify-content: center;
      padding: 0.65rem 1.05rem;
      border: 1px solid var(--primary); border-radius: var(--radius-sm);
      background: var(--primary); color: #fff;
      font: inherit; font-weight: 700; text-decoration: none; cursor: pointer;
    }
    .btn:hover { background: var(--primary-strong); border-color: var(--primary-strong); color: #fff; }
    .btn--compact { min-height: 38px; padding: 0.45rem 0.85rem; font-size: 0.9rem; }
    .btn--ghost {
      background: transparent; border-color: rgb(255 255 255 / 45%); color: var(--hero-ink);
    }
    .btn--ghost:hover { background: rgb(255 255 255 / 12%); border-color: #fff; color: #fff; }
    .section .btn--ghost {
      background: #fff; border-color: var(--primary); color: var(--primary);
    }
    .section .btn--ghost:hover {
      background: var(--primary-soft); border-color: var(--primary-strong); color: var(--primary-strong);
    }
    .fine-print { margin-top: 0.75rem; color: rgb(244 248 252 / 72%); font-size: 0.86rem; }
    .hero-marketing {
      position: relative; overflow: hidden; display: grid; align-items: center;
      padding-block: clamp(2.25rem, 5vw, 3.75rem);
      color: var(--hero-ink); background: #0c4488;
    }
    .hero-marketing__atmosphere {
      position: absolute; inset: 0; opacity: 0.14; pointer-events: none;
      background-image:
        linear-gradient(rgb(255 255 255 / 55%) 1px, transparent 1px),
        linear-gradient(90deg, rgb(255 255 255 / 55%) 1px, transparent 1px);
      background-size: 40px 40px;
    }
    .hero-marketing__inner { position: relative; z-index: 1; max-width: 760px; }
    .hero-marketing h1 {
      margin-bottom: 0.75rem; color: #fff;
      font-size: clamp(2.4rem, 6vw, 3.6rem);
    }
    .hero-marketing__lead {
      max-width: 36rem; color: rgb(244 248 252 / 86%);
      font-size: clamp(1.05rem, 1.8vw, 1.2rem);
    }
    .section { padding-block: clamp(3.5rem, 6vw, 5.5rem); }
    .section-heading { max-width: 640px; margin-bottom: 2.25rem; }
    .section-heading h2 { margin-bottom: 0.65rem; }
    .section-heading p { color: var(--muted); }
    .section--how {
      background: var(--surface);
      border-block: 1px solid var(--border);
    }
    .section--pricing {
      background: #e6eef7;
      border-block: 1px solid var(--border);
    }
    .try-embed {
      display: grid; grid-template-columns: 1.15fr 0.85fr; gap: 1.5rem;
      padding: clamp(1.35rem, 3vw, 2rem);
      border: 1px solid var(--border); border-radius: var(--radius-md);
      background: var(--surface);
    }
    .try-embed__form label {
      display: block; margin-bottom: 0.55rem; font-size: 0.92rem; font-weight: 650;
    }
    .try-embed__row { display: flex; gap: 0.65rem; align-items: stretch; }
    .try-embed__row input {
      flex: 1; min-width: 0; min-height: 52px; padding: 0.7rem 0.95rem;
      border: 1px solid var(--border-strong); border-radius: var(--radius-sm);
      background: #fff; color: var(--text); font: inherit; font-size: 1.05rem;
    }
    .try-embed__submit { flex: 0 0 auto; min-width: 5.5rem; }
    .try-embed__samples { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.85rem; }
    .try-embed__sample {
      min-height: 34px; padding: 0.35rem 0.75rem;
      border: 1px solid var(--border-strong); border-radius: var(--radius-sm);
      background: var(--surface-subtle); color: var(--text);
      font: inherit; font-size: 0.85rem; font-weight: 650; cursor: pointer;
    }
    .try-embed__sample:hover, .try-embed__sample.is-active {
      border-color: var(--primary); background: var(--primary-soft); color: var(--primary-strong);
    }
    .try-embed__hint { margin: 0.85rem 0 0; color: var(--muted); font-size: 0.88rem; }
    .try-embed__result {
      display: grid; align-content: center; min-height: 200px;
      padding: 1.4rem 1.5rem;
      border: 1px solid #0a3568; border-radius: var(--radius-sm);
      background: #0c4488; color: #f4f8fc;
    }
    .try-embed__placeholder { color: rgb(244 248 252 / 62%); font-size: 1.02rem; }
    .try-embed__status { font-weight: 600; }
    .try-embed__status--error, .try-embed__status--empty { color: #ffd0c8; }
    .try-embed__label {
      margin: 0 0 0.45rem; color: rgb(186 220 255 / 88%);
      font-size: 0.88rem; font-weight: 600;
    }
    .try-embed__riding {
      font-family: var(--font-display);
      font-size: clamp(1.55rem, 3vw, 2.15rem); font-weight: 700;
      letter-spacing: -0.03em; line-height: 1.15;
    }
    .try-embed__meta { display: flex; flex-wrap: wrap; gap: 0.45rem; margin-top: 1.1rem; }
    .try-embed__chip {
      display: inline-flex; padding: 0.28rem 0.65rem;
      border: 1px solid rgb(255 255 255 / 22%); border-radius: var(--radius-sm);
      background: rgb(255 255 255 / 10%); color: #e8f3ff;
      font-size: 0.78rem; font-weight: 650;
    }
    .try-embed__query { margin: 1.15rem 0 0; color: rgb(210 228 245 / 72%); font-size: 0.86rem; }
    .flow {
      display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.75rem 2rem;
      list-style: none;
    }
    .flow li { display: flex; gap: 0.95rem; align-items: flex-start; }
    .flow__num {
      display: grid; width: 2.15rem; height: 2.15rem; flex: 0 0 auto;
      place-items: center; margin-top: 0.1rem;
      border: 1px solid var(--border-strong); border-radius: var(--radius-sm);
      background: var(--primary-soft); color: var(--primary-strong);
      font-family: var(--font-display); font-size: 1.05rem; font-weight: 700;
    }
    .flow__body { min-width: 0; }
    .flow h3 { margin-bottom: 0.4rem; }
    .flow p { color: var(--muted); font-size: 0.98rem; }
    .flow code { font-size: 0.88em; }
    .pricing-grid {
      display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1.25rem;
    }
    .price-card {
      padding: clamp(1.5rem, 3vw, 2.2rem);
      border: 1px solid var(--border); border-radius: var(--radius-md);
      background: var(--surface);
    }
    .price-card--featured { border-color: var(--primary); }
    .price {
      margin: 1rem 0 0; font-size: 2.3rem; font-weight: 780; letter-spacing: -0.04em;
    }
    .price span { font-size: 0.85rem; font-weight: 650; }
    .price-detail { margin-bottom: 1.5rem; color: var(--muted); min-height: 1.5rem; }
    .check-list { display: grid; gap: 0.65rem; list-style: none; margin: 0 0 0.5rem; }
    .check-list li::before { content: "✓"; margin-right: 0.65rem; color: var(--success); font-weight: 800; }
    .pricing-note { margin: 1.5rem 0 0; color: var(--muted); font-size: 0.88rem; }
    .coverage-routes {
      max-width: 52rem;
      color: var(--muted);
      font-size: 0.92rem;
      line-height: 1.85;
    }
    .coverage-routes a { text-decoration: none; }
    .coverage-routes code {
      font-size: 0.85em;
      padding: 0.1em 0.35em;
      border-radius: 4px;
      background: var(--surface-subtle);
    }
    .site-footer { padding-block: 2rem; background: var(--surface); }
    .site-footer .shell {
      display: flex; justify-content: space-between; gap: 1rem;
      color: var(--muted); font-size: 0.88rem;
    }
    .site-footer__links { display: flex; gap: 1.25rem; }
    .site-footer__links a { color: var(--muted); font-weight: 600; text-decoration: none; }
    .site-footer__links a:hover { color: var(--primary); }
    @media (max-width: 800px) {
      .try-embed, .flow, .pricing-grid { grid-template-columns: 1fr; }
      .nav__links > a:not(.btn) { display: none; }
    }
  </style>
</head>
<body>
  <header class="site-header">
    <nav class="nav shell" aria-label="Main navigation">
      <a class="brand" href="${baseUrl}/">CanCoder</a>
      <div class="nav__links">
        <a href="#try-it">Try it</a>
        <a href="#product">Product</a>
        <a href="#pricing">Pricing</a>
        <a href="${baseUrl}/docs">Docs</a>
        <a class="btn btn--compact" href="${baseUrl}/docs">API reference</a>
      </div>
    </nav>
  </header>

  <main>
    <section class="hero-marketing">
      <div class="hero-marketing__atmosphere" aria-hidden="true"></div>
      <div class="shell hero-marketing__inner">
        <h1>CanCoder</h1>
        <p class="hero-marketing__lead">
          Turn any Canadian address into its electoral riding. Geocode, autocomplete, and map
          to federal and provincial districts — for campaign tools and form vendors.
        </p>
        <div class="button-row">
          <a class="btn" href="#try-it">Try a lookup</a>
          <a class="btn btn--ghost" href="${baseUrl}/docs">View docs</a>
        </div>
        <p class="fine-print">No credit card · ${FREE_MONTHLY} calls / month on the free tier</p>
      </div>
    </section>

    <section class="section shell" id="try-it">
      <div class="section-heading">
        <h2>Try it on a real address</h2>
        <p>Updates as you type. Same path as the embed widget and lookup API.</p>
      </div>
      <div class="try-embed">
        <form class="try-embed__form" id="try-form">
          <label for="try-address">Canadian address or postal code</label>
          <div class="try-embed__row">
            <input id="try-address" name="address" autocomplete="street-address"
              value="${SAMPLES[0].query}" placeholder="123 Main St, Toronto, ON">
            <button class="btn try-embed__submit" type="submit" id="try-submit">Find</button>
          </div>
          <div class="try-embed__samples" role="group" aria-label="Sample locations">
            ${SAMPLES.map(
              (s) =>
                `<button type="button" class="try-embed__sample${s === SAMPLES[0] ? ' is-active' : ''}" data-query="${s.query}" data-lat="${s.lat}" data-lon="${s.lon}">${s.label}</button>`
            ).join('')}
          </div>
          <p class="try-embed__hint">Demo calls are free and rate-limited.</p>
        </form>
        <div class="try-embed__result" id="try-result" aria-live="polite">
          <p class="try-embed__placeholder">Start typing an address to see the riding.</p>
        </div>
      </div>
    </section>

    <section class="section section--how" id="product">
      <div class="shell">
        <div class="section-heading">
          <h2>What CanCoder does</h2>
          <p>Three products in one API — autocomplete, geocode, and riding lookup.</p>
        </div>
        <ol class="flow">
          <li>
            <span class="flow__num" aria-hidden="true">1</span>
            <div class="flow__body">
              <h3>Address autocomplete</h3>
              <p>Drop-in embed for your forms. As-you-type Canadian suggestions via <code>/embed.js</code> and <code>/api/search</code>, then hand off a clean address on select.</p>
            </div>
          </li>
          <li>
            <span class="flow__num" aria-hidden="true">2</span>
            <div class="flow__body">
              <h3>Canadian geocoding</h3>
              <p>Self-hosted StatCan address data turns a postal code or street address into a precise point — normalize and reverse geocode when you need them.</p>
            </div>
          </li>
          <li>
            <span class="flow__num" aria-hidden="true">3</span>
            <div class="flow__body">
              <h3>Electoral riding lookup</h3>
              <p>Point-in-polygon against official boundaries returns federal and provincial ridings — names and codes ready for routing and tagging.</p>
            </div>
          </li>
        </ol>
        <div class="button-row button-row--section">
          <a class="btn" href="${baseUrl}/docs">Get started in docs</a>
          <a class="btn btn--ghost" href="${baseUrl}/docs">View docs</a>
        </div>
      </div>
    </section>

    <section class="section section--pricing" id="pricing">
      <div class="shell">
        <div class="section-heading">
          <h2>Start free. Pay only when usage grows.</h2>
          <p>Successful lookups and searches count. Errors never do.</p>
        </div>
        <div class="pricing-grid">
          <article class="price-card">
            <h3>Free</h3>
            <p class="price">$0</p>
            <p class="price-detail">No expiry and no credit card</p>
            <ul class="check-list">
              <li>${FREE_MONTHLY} calls / month</li>
              <li>Server and Browser keys</li>
              <li>Usage dashboard and hard fuse</li>
            </ul>
            <a class="btn" href="${baseUrl}/docs">Start free</a>
          </article>
          <article class="price-card price-card--featured">
            <h3>Metered</h3>
            <p class="price">${METERED_PRICE}<span> USD</span></p>
            <p class="price-detail">per successful call after the free allowance</p>
            <ul class="check-list">
              <li>Includes the free monthly allowance</li>
              <li>No charge for 4xx or 5xx responses</li>
              <li>Set a monthly hard limit at any time</li>
            </ul>
            <a class="btn" href="${baseUrl}/docs">See API reference</a>
          </article>
        </div>
        <p class="pricing-note">Usage resets each UTC calendar month. Paid access is enabled after the product addendum is signed.</p>
      </div>
    </section>

    <section class="section shell" id="coverage" aria-label="API coverage">
      <div class="section-heading">
        <h2>Coverage</h2>
        <p>Federal and every provincial / territorial riding route, live in the API.</p>
      </div>
      <p class="coverage-routes">
        <a href="${baseUrl}/api"><code>/api</code></a> ·
        <a href="${baseUrl}/api/combined"><code>/api/combined</code></a> ·
        ${provincialLinks}
      </p>
    </section>
  </main>

  <footer class="site-footer">
    <div class="shell">
      <span>CanCoder by Chester Hill Solutions</span>
      <div class="site-footer__links">
        <a href="${baseUrl}/docs">Docs</a>
        <a href="${baseUrl}/health">Health</a>
        <a href="https://github.com/chester-hill-solutions/riding-and-address">GitHub</a>
      </div>
    </div>
  </footer>

  <script>
    (function () {
      var baseUrl = ${JSON.stringify(baseUrl)};
      var samples = ${samplesJson};
      var input = document.getElementById('try-address');
      var form = document.getElementById('try-form');
      var resultEl = document.getElementById('try-result');
      var submitBtn = document.getElementById('try-submit');
      var seq = 0;
      var timer = null;
      var DEBOUNCE_MS = 320;

      function ridingName(props) {
        if (!props) return null;
        var keys = ['FED_NAME', 'ED_NAMEE', 'ENGLISH_NAME', 'NAME', 'riding'];
        for (var i = 0; i < keys.length; i++) {
          var v = props[keys[i]];
          if (typeof v === 'string' && v.trim()) return v.trim();
        }
        return null;
      }

      function paramsForQuery(trimmed) {
        for (var i = 0; i < samples.length; i++) {
          if (samples[i].query.toLowerCase() === trimmed.toLowerCase()) {
            return 'lat=' + samples[i].lat + '&lon=' + samples[i].lon;
          }
        }
        if (/^[A-Za-z]\\d[A-Za-z]\\s?\\d[A-Za-z]\\d$/.test(trimmed)) {
          return 'postal=' + encodeURIComponent(trimmed.toUpperCase());
        }
        return 'address=' + encodeURIComponent(trimmed);
      }

      function renderResult(status, payload) {
        if (status === 'idle') {
          resultEl.innerHTML = '<p class="try-embed__placeholder">Start typing an address to see the riding.</p>';
          return;
        }
        if (status === 'loading' && !payload) {
          resultEl.innerHTML = '<p class="try-embed__status">Resolving riding…</p>';
          return;
        }
        if (status === 'error' || status === 'empty') {
          resultEl.innerHTML = '<p class="try-embed__status try-embed__status--' + status + '">' + payload + '</p>';
          return;
        }
        var chips = '';
        if (payload.fedNum) chips += '<span class="try-embed__chip">FED ' + payload.fedNum + '</span>';
        resultEl.innerHTML =
          '<div class="try-embed__card">' +
          '<p class="try-embed__label">Federal electoral district</p>' +
          '<p class="try-embed__riding">' + payload.federal + '</p>' +
          (chips ? '<div class="try-embed__meta">' + chips + '</div>' : '') +
          '<p class="try-embed__query">' + payload.queryLabel + '</p>' +
          '</div>';
      }

      function lookup(trimmed) {
        if (trimmed.length < 3) {
          seq += 1;
          renderResult('idle');
          submitBtn.textContent = 'Find';
          submitBtn.disabled = false;
          return;
        }
        var my = ++seq;
        submitBtn.textContent = '…';
        submitBtn.disabled = true;
        renderResult('loading');
        fetch(baseUrl + '/api/demo/federal?' + paramsForQuery(trimmed), {
          headers: { accept: 'application/json' }
        })
          .then(function (res) {
            if (my !== seq) return null;
            if (!res.ok) {
              renderResult('error', res.status === 429
                ? 'Demo limit reached — try again in a minute.'
                : 'Could not resolve that location.');
              return null;
            }
            return res.json();
          })
          .then(function (body) {
            if (my !== seq || !body) return;
            var federal = ridingName(body.properties) || (body.riding && String(body.riding)) || null;
            var fedNum = body.properties && body.properties.FED_NUM != null
              ? String(body.properties.FED_NUM) : null;
            if (!federal) {
              renderResult('empty', 'No riding found for that location.');
              return;
            }
            renderResult('ok', { federal: federal, fedNum: fedNum, queryLabel: trimmed });
          })
          .catch(function () {
            if (my !== seq) return;
            renderResult('error', 'Network error — try again.');
          })
          .finally(function () {
            if (my !== seq) return;
            submitBtn.textContent = 'Find';
            submitBtn.disabled = false;
          });
      }

      function schedule() {
        if (timer) clearTimeout(timer);
        timer = setTimeout(function () { lookup(input.value.trim()); }, DEBOUNCE_MS);
      }

      input.addEventListener('input', schedule);
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (timer) clearTimeout(timer);
        lookup(input.value.trim());
      });

      document.querySelectorAll('.try-embed__sample').forEach(function (btn) {
        btn.addEventListener('click', function () {
          document.querySelectorAll('.try-embed__sample').forEach(function (b) {
            b.classList.remove('is-active');
          });
          btn.classList.add('is-active');
          input.value = btn.getAttribute('data-query') || '';
          if (timer) clearTimeout(timer);
          lookup(input.value.trim());
        });
      });

      lookup(input.value.trim());
    })();
  </script>
</body>
</html>`;
}
