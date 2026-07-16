/**
 * The `/embed.js` drop-in autocomplete widget.
 *
 * Served as a string, mirroring `createLandingPage` / `createApiReference`. The widget source
 * deliberately uses no backticks or `${}` so it cannot collide with this template literal, and
 * it is tested by evaluating this exact output in jsdom (see `test/embed-widget.test.ts`) rather
 * than by typechecking -- tsconfig has no DOM lib, because DOM types conflict with
 * @cloudflare/workers-types.
 */

export const EMBED_VERSION = '1.2.0';

export function createEmbedScript(baseUrl: string): string {
  return `/* CanCoder autocomplete widget v${EMBED_VERSION} */
(function (global, factory) {
  if (global.RidingLookup) return;
  global.RidingLookup = factory(global);
})(typeof globalThis !== 'undefined' ? globalThis : self, function (global) {
  'use strict';

  var VERSION = ${JSON.stringify(EMBED_VERSION)};
  var DEFAULT_ENDPOINT = ${JSON.stringify(baseUrl)};
  var document = global.document;

  var DEFAULTS = {
    key: '',
    minLength: 3,
    debounce: 150,
    limit: 7,
    fill: true,
    includeProvince: false,
    // true -> resolve riding via keyless /api/demo/* (marketing try-it); search still needs a key when API_KEYS is on.
    demo: false,
    useGeolocation: false,
    // '' follows the page's prefers-color-scheme; 'light'/'dark' pin the palette explicitly.
    theme: ''
  };

  // Province selects are as likely to hold "Ontario" as "ON", so we can fill either.
  var PROVINCES = {
    AB: 'Alberta', BC: 'British Columbia', MB: 'Manitoba', NB: 'New Brunswick',
    NL: 'Newfoundland and Labrador', NS: 'Nova Scotia', NT: 'Northwest Territories',
    NU: 'Nunavut', ON: 'Ontario', PE: 'Prince Edward Island', QC: 'Quebec',
    SK: 'Saskatchewan', YT: 'Yukon'
  };

  // ---------------------------------------------------------------------------
  // Field detection
  // ---------------------------------------------------------------------------

  // Ordered: the autocomplete attribute is a web standard and an explicit statement of intent,
  // so it always beats guessing from name/id/placeholder.
  var FIELD_RULES = {
    address: {
      tokens: ['street-address', 'address-line1'],
      match: /(^|[^a-z])(street[_-]?address|address[_-]?line[_-]?1|addr(ess)?[_-]?1|address|addr|street)([^a-z2]|$)/i,
      // "email address" is the classic false positive; line-2 and unit fields are not the street.
      reject: /(e-?mail|address[_-]?(line[_-]?)?2|addr[_-]?2|line[_-]?2|apt|apartment|unit|suite|buzz|country|company|name|phone|search)/i
    },
    // Boundaries matter: "prov" must match but "improve" must not, "city" but not "capacity",
    // "town" but not "Georgetown".
    city: {
      tokens: ['address-level2'],
      match: /(^|[^a-z])(city|municipality|town|locality)([^a-z]|$)/i,
      reject: /(country)/i
    },
    province: {
      tokens: ['address-level1'],
      match: /(^|[^a-z])(province|prov|state|region)([^a-z]|$)/i,
      reject: /(country|estate)/i
    },
    postal: {
      tokens: ['postal-code'],
      match: /(^|[^a-z])(postal|post[_-]?code|postcode|zip)([^a-z]|$)/i,
      reject: null
    }
  };

  function autocompleteToken(el) {
    var raw = (el.getAttribute('autocomplete') || '').toLowerCase().trim();
    if (!raw || raw === 'off' || raw === 'on') return '';
    // Values can be section/shipping/billing prefixed: "shipping address-line1".
    var parts = raw.split(/\\s+/);
    return parts[parts.length - 1];
  }

  function fieldHaystack(el) {
    var label = '';
    if (el.id && document) {
      var forLabel = document.querySelector('label[for="' + cssEscape(el.id) + '"]');
      if (forLabel) label = forLabel.textContent || '';
    }
    if (!label && el.closest) {
      var wrapping = el.closest('label');
      if (wrapping) label = wrapping.textContent || '';
    }
    return [el.name, el.id, el.getAttribute('placeholder'), el.getAttribute('aria-label'), label]
      .filter(Boolean)
      .join(' ');
  }

  function cssEscape(value) {
    if (global.CSS && global.CSS.escape) return global.CSS.escape(value);
    return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\\\$&');
  }

  function scoreField(el, kind) {
    var rule = FIELD_RULES[kind];
    if (!rule) return 0;

    var token = autocompleteToken(el);
    if (token && rule.tokens.indexOf(token) !== -1) return 3;
    // A field that explicitly declares itself as something else is not our field.
    if (token && isKnownToken(token)) return 0;

    var haystack = fieldHaystack(el);
    if (!haystack) return 0;
    if (rule.reject && rule.reject.test(haystack)) return 0;
    return rule.match.test(haystack) ? 1 : 0;
  }

  function isKnownToken(token) {
    for (var kind in FIELD_RULES) {
      if (FIELD_RULES[kind].tokens.indexOf(token) !== -1) return true;
    }
    return false;
  }

  function isFillable(el) {
    if (!el || el.disabled || el.readOnly) return false;
    var tag = el.tagName;
    if (tag === 'SELECT' || tag === 'TEXTAREA') return true;
    if (tag !== 'INPUT') return false;
    var type = (el.getAttribute('type') || 'text').toLowerCase();
    return ['text', 'search', 'tel', 'url', ''].indexOf(type) !== -1;
  }

  function findField(scope, kind) {
    var best = null;
    var bestScore = 0;
    var candidates = scope.querySelectorAll('input, select, textarea');
    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i];
      if (!isFillable(el)) continue;
      var score = scoreField(el, kind);
      if (score > bestScore) {
        best = el;
        bestScore = score;
      }
    }
    return best;
  }

  function resolveElement(ref, scope) {
    if (!ref) return null;
    if (typeof ref === 'string') return (scope || document).querySelector(ref);
    if (ref.nodeType === 1) return ref;
    return null;
  }

  // ---------------------------------------------------------------------------
  // Writing values that frameworks actually notice
  // ---------------------------------------------------------------------------

  /**
   * Assigning el.value updates the DOM but not React/Vue state -- the framework re-renders and
   * silently reverts it. React also installs its own 'value' property on the element and tracks
   * the last value it saw, so we go through the prototype setter and then fire real events.
   */
  function setNativeValue(el, value) {
    var proto = Object.getPrototypeOf(el);
    var ownDescriptor = Object.getOwnPropertyDescriptor(el, 'value');
    var protoDescriptor = Object.getOwnPropertyDescriptor(proto, 'value');

    // Defeat React's _valueTracker dedupe: make it believe the previous value was different.
    var tracker = el._valueTracker;
    if (tracker && typeof tracker.setValue === 'function') tracker.setValue('\\u0000');

    if (protoDescriptor && protoDescriptor.set && ownDescriptor && ownDescriptor.set !== protoDescriptor.set) {
      protoDescriptor.set.call(el, value);
    } else if (protoDescriptor && protoDescriptor.set) {
      protoDescriptor.set.call(el, value);
    } else {
      el.value = value;
    }

    dispatch(el, 'input');
    dispatch(el, 'change');
  }

  function dispatch(el, type, detail) {
    var event;
    if (detail === undefined) {
      try {
        event = new global.Event(type, { bubbles: true });
      } catch (e) {
        event = document.createEvent('Event');
        event.initEvent(type, true, false);
      }
    } else {
      try {
        event = new global.CustomEvent(type, { bubbles: true, detail: detail });
      } catch (e2) {
        event = document.createEvent('CustomEvent');
        event.initCustomEvent(type, true, false, detail);
      }
    }
    el.dispatchEvent(event);
    return event;
  }

  /** Province may be a <select> holding either codes or full names. */
  function setProvince(el, code) {
    if (!el) return;
    if (el.tagName !== 'SELECT') {
      setNativeValue(el, code);
      return;
    }
    var name = PROVINCES[code] || '';
    var wanted = [code.toLowerCase(), name.toLowerCase()];
    for (var i = 0; i < el.options.length; i++) {
      var option = el.options[i];
      var value = (option.value || '').toLowerCase();
      var text = (option.textContent || '').trim().toLowerCase();
      if (wanted.indexOf(value) !== -1 || wanted.indexOf(text) !== -1) {
        setNativeValue(el, option.value);
        return;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Dropdown
  // ---------------------------------------------------------------------------

  // One dark ruleset, applied two ways: by the OS preference (unless the integrator pinned
  // data-theme="light") and by an explicit data-theme="dark", which must win over a light OS.
  var DARK_PANEL_VARS = '--rl-bg:#1b1f27;--rl-fg:#e6e9ef;--rl-muted:#98a2b3;'
    + '--rl-border:#3a4150;--rl-active:#2c3444;--rl-pill:#3a4150;--rl-error:#f97066';

  var STYLES = [
    ':host{all:initial}',
    '.panel{--rl-bg:#fff;--rl-fg:#111;--rl-muted:#667085;--rl-border:#d0d5dd;',
    '--rl-active:#eef2ff;--rl-pill:#e4e7ec;--rl-error:#b42318;',
    'position:absolute;z-index:2147483647;background:var(--rl-bg);color:var(--rl-fg);',
    'border:1px solid var(--rl-border);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.14);',
    'font:14px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;overflow:hidden;',
    'max-height:320px;overflow-y:auto;display:none}',
    '.panel[data-open="true"]{display:block}',
    '.item{padding:8px 12px;cursor:pointer;display:flex;justify-content:space-between;gap:12px;align-items:baseline}',
    '.item[aria-selected="true"]{background:var(--rl-active)}',
    '.main{color:var(--rl-fg)}',
    '.main b{font-weight:700}',
    '.sub{color:var(--rl-muted);font-size:12px;white-space:nowrap}',
    '.count{color:var(--rl-muted);font-size:11px;border:1px solid var(--rl-pill);border-radius:999px;padding:1px 6px}',
    '.empty{padding:10px 12px;color:var(--rl-muted)}',
    '.error{padding:10px 12px;color:var(--rl-error)}',
    '.panel[data-loading="true"]::after{content:"Searching…";display:block;',
    'padding:8px 12px;color:var(--rl-muted);font-size:12px}',
    // Visually hidden but announced: the aria-live region for screen readers.
    '.status{position:absolute;width:1px;height:1px;margin:-1px;padding:0;border:0;',
    'overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}',
    '@media (prefers-color-scheme:dark){:host(:not([data-theme="light"])) .panel{' + DARK_PANEL_VARS + '}}',
    ':host([data-theme="dark"]) .panel{' + DARK_PANEL_VARS + '}'
  ].join('');

  function createPanel() {
    var host = document.createElement('div');
    host.setAttribute('data-riding-lookup', '');
    // Shadow DOM so the host page's CSS cannot break the dropdown, and ours cannot leak out.
    var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
    var style = document.createElement('style');
    style.textContent = STYLES;
    var panel = document.createElement('div');
    panel.className = 'panel';
    panel.setAttribute('role', 'listbox');
    panel.setAttribute('aria-label', 'Address suggestions');
    // The dropdown is purely visual to a screen reader; this polite live region is what
    // actually announces result counts, empty results, and failures.
    var status = document.createElement('div');
    status.className = 'status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    root.appendChild(style);
    root.appendChild(panel);
    root.appendChild(status);
    document.body.appendChild(host);
    return { host: host, panel: panel, status: status };
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** Bold the matched ranges the API returns, without letting text become markup. */
  function highlight(text, matches) {
    if (!matches || !matches.length) return escapeHtml(text);
    var ordered = matches.slice().sort(function (a, b) { return a.startOffset - b.startOffset; });
    var out = '';
    var cursor = 0;
    for (var i = 0; i < ordered.length; i++) {
      var m = ordered[i];
      if (m.startOffset < cursor || m.startOffset > text.length) continue;
      out += escapeHtml(text.slice(cursor, m.startOffset));
      out += '<b>' + escapeHtml(text.slice(m.startOffset, m.endOffset)) + '</b>';
      cursor = m.endOffset;
    }
    return out + escapeHtml(text.slice(cursor));
  }

  // ---------------------------------------------------------------------------
  // Instance
  // ---------------------------------------------------------------------------

  function attach(options) {
    options = options || {};
    var scope = resolveElement(options.form, document) || document;
    var input = resolveElement(options.input, scope) || findField(scope, 'address');
    if (!input) return null;
    if (input.__ridingLookup) return input.__ridingLookup;

    var config = {};
    for (var key in DEFAULTS) config[key] = DEFAULTS[key];
    for (var override in options) if (options[override] !== undefined) config[override] = options[override];

    var endpoint = String(config.endpoint || DEFAULT_ENDPOINT).replace(/\\/+$/, '');
    var fieldRefs = options.fields || {};
    var container = input.form || scope;

    var fields = {
      city: resolveElement(fieldRefs.city, scope) || findField(container, 'city'),
      province: resolveElement(fieldRefs.province, scope) || findField(container, 'province'),
      postal: resolveElement(fieldRefs.postal, scope) || findField(container, 'postal'),
      riding: resolveElement(fieldRefs.riding, scope)
    };

    var ui = createPanel();
    var listId = 'rl-list-' + Math.random().toString(36).slice(2, 9);
    ui.panel.id = listId;
    if (config.theme === 'light' || config.theme === 'dark') {
      ui.host.setAttribute('data-theme', config.theme);
    }

    var state = {
      items: [], active: -1, open: false, containerId: null, seq: 0, controller: null,
      timer: null, loadingTimer: null, suppress: false
    };

    /**
     * Our own writes go through setNativeValue, which dispatches a real 'input' event -- that is
     * the whole point, so frameworks notice. But it also re-enters our own input handler, which
     * would clear the drilled-into container and re-open the dropdown we just closed. Suppress
     * while we write; dispatch is synchronous, so the flag covers exactly our own event.
     */
    function programmatic(write) {
      state.suppress = true;
      try { write(); } finally { state.suppress = false; }
    }

    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-controls', listId);

    // Ask the browser not to stack its own autofill dropdown on top of ours. Chrome is known to
    // ignore this on fields it reads as address fields; stronger suppression (an unrecognised
    // token) would also kill the legitimate autofill some users want, so it is not worth it
    // unless a competing dropdown actually proves to be a problem in practice.
    var previousAutocomplete = input.getAttribute('autocomplete');
    input.setAttribute('autocomplete', 'off');

    function emit(type, detail) { return dispatch(input, 'ridinglookup:' + type, detail); }

    function position() {
      var rect = input.getBoundingClientRect();
      var top = rect.bottom + (global.pageYOffset || 0) + 4;
      var left = rect.left + (global.pageXOffset || 0);
      ui.panel.style.top = top + 'px';
      ui.panel.style.left = left + 'px';
      ui.panel.style.width = rect.width + 'px';
    }

    function close() {
      state.open = false;
      state.active = -1;
      ui.panel.setAttribute('data-open', 'false');
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
    }

    function openPanel() {
      state.open = true;
      ui.panel.setAttribute('data-open', 'true');
      input.setAttribute('aria-expanded', 'true');
      position();
    }

    function announce(text) {
      ui.status.textContent = text;
    }

    /**
     * Pending indicator. Deferred 200ms so fast responses never flash it; the timer is
     * cleared the moment the request settles or a newer request supersedes it.
     */
    function setLoading(on) {
      if (state.loadingTimer) { clearTimeout(state.loadingTimer); state.loadingTimer = null; }
      if (!on) {
        ui.panel.removeAttribute('data-loading');
        return;
      }
      state.loadingTimer = setTimeout(function () {
        state.loadingTimer = null;
        ui.panel.setAttribute('data-loading', 'true');
        // First search from a closed panel: open it so "Searching…" is actually visible.
        if (!state.open) {
          ui.panel.innerHTML = '';
          openPanel();
        }
      }, 200);
    }

    /** A single non-interactive row: the empty and error states of the panel. */
    function renderNotice(className, text) {
      state.active = -1;
      input.removeAttribute('aria-activedescendant');
      ui.panel.innerHTML = '<div class="' + className + '">' + escapeHtml(text) + '</div>';
      openPanel();
    }

    function render() {
      if (!state.items.length) {
        ui.panel.innerHTML = '';
        close();
        announce('');
        return;
      }
      var html = '';
      for (var i = 0; i < state.items.length; i++) {
        var item = state.items[i];
        var sf = item.structuredFormat || {};
        var main = (sf.mainText && sf.mainText.text) || item.text || '';
        var matches = sf.mainText && sf.mainText.matches;
        var sub = (sf.secondaryText && sf.secondaryText.text) || item.description || '';
        var count = item.addressCount ? '<span class="count">' + escapeHtml(item.addressCount) + '</span>' : '';
        html += '<div class="item" role="option" id="' + listId + '-' + i + '"'
          + ' data-index="' + i + '" aria-selected="' + (i === state.active) + '">'
          + '<span class="main">' + highlight(main, matches) + '</span>'
          + '<span class="sub">' + escapeHtml(sub) + count + '</span>'
          + '</div>';
      }
      ui.panel.innerHTML = html;
      openPanel();
      announce(state.items.length + (state.items.length === 1 ? ' suggestion' : ' suggestions'));
    }

    function setActive(index) {
      if (!state.items.length) return;
      state.active = (index + state.items.length) % state.items.length;
      var nodes = ui.panel.querySelectorAll('.item');
      for (var i = 0; i < nodes.length; i++) {
        nodes[i].setAttribute('aria-selected', String(i === state.active));
      }
      input.setAttribute('aria-activedescendant', listId + '-' + state.active);
      var node = nodes[state.active];
      if (node && node.scrollIntoView) node.scrollIntoView({ block: 'nearest' });
    }

    function buildUrl(value) {
      var url = endpoint + '/api/search?q=' + encodeURIComponent(value);
      // Public by design: this key is an identifier the server pairs with an origin allowlist,
      // not a secret. See docs/oda-geolocation-contract.md.
      if (config.key) url += '&key=' + encodeURIComponent(config.key);
      if (config.province) url += '&province=' + encodeURIComponent(config.province);
      if (config.limit) url += '&limit=' + encodeURIComponent(config.limit);
      if (state.containerId) url += '&containerId=' + encodeURIComponent(state.containerId);
      if (config.locationBias) {
        url += '&locationBias=' + encodeURIComponent(config.locationBias.lat + ',' + config.locationBias.lon);
      } else if (config.locationRestriction) {
        var r = config.locationRestriction;
        url += '&locationRestriction=' + encodeURIComponent([r.minLat, r.minLon, r.maxLat, r.maxLon].join(','));
      }
      return url;
    }

    function search(value) {
      if (!value || value.trim().length < config.minLength) {
        setLoading(false);
        state.items = [];
        render();
        return Promise.resolve([]);
      }

      // Abort the in-flight request and stamp this one, so a slow early keystroke can never
      // overwrite the results of a later one.
      if (state.controller) state.controller.abort();
      var controller = typeof global.AbortController === 'function' ? new global.AbortController() : null;
      state.controller = controller;
      var seq = ++state.seq;
      setLoading(true);

      return fetch(buildUrl(value), {
        headers: { accept: 'application/json' },
        credentials: 'omit',
        signal: controller ? controller.signal : undefined
      })
        .then(function (response) {
          if (!response.ok) throw new Error('Search failed: ' + response.status);
          return response.json();
        })
        .then(function (body) {
          if (seq !== state.seq) return [];
          setLoading(false);
          state.items = (body && body.suggestions) || [];
          state.active = -1;
          if (state.items.length) {
            render();
          } else {
            // The query was long enough to search, so silently closing would read as a hang.
            renderNotice('empty', 'No matching addresses');
            announce('No results');
          }
          return state.items;
        })
        .catch(function (error) {
          // Aborted means superseded: the newer request now owns the panel and the indicator.
          if (error && error.name === 'AbortError') return [];
          if (seq !== state.seq) return [];
          setLoading(false);
          state.items = [];
          renderNotice('error', 'Search unavailable — try again');
          announce('Search unavailable');
          emit('error', { error: error });
          return [];
        });
    }

    function fillAddress(suggestion) {
      if (!config.fill) return;
      var parts = suggestion.addressComponents || {};
      var sf = suggestion.structuredFormat || {};
      var line = (sf.mainText && sf.mainText.text) || suggestion.text || '';
      programmatic(function () {
        setNativeValue(input, line);
        if (fields.city && parts.locality) setNativeValue(fields.city, parts.locality);
        if (fields.province && parts.administrative_area_level_1) {
          setProvince(fields.province, parts.administrative_area_level_1);
        }
        if (fields.postal && parts.postal_code) setNativeValue(fields.postal, parts.postal_code);
      });
    }

    function resolveRiding(suggestion) {
      var path;
      if (config.demo) {
        path = config.includeProvince
          ? '/api/demo/combined?include_province=true&'
          : '/api/demo/federal?';
      } else {
        path = config.includeProvince
          ? '/api/combined?include_province=true&'
          : '/api/federal?';
      }
      var url = endpoint + path + 'lat=' + suggestion.location.lat + '&lon=' + suggestion.location.lon;
      return fetch(url, { headers: { accept: 'application/json' }, credentials: 'omit' })
        .then(function (response) {
          if (!response.ok) throw new Error('Riding lookup failed: ' + response.status);
          return response.json();
        })
        .then(function (body) {
          var properties = body.properties || {};
          var name = properties.ENGLISH_NAME || properties.ED_NAMEE || properties.NAME || null;
          var result = {
            riding: name,
            properties: properties,
            provinceData: body.province_data,
            point: body.point,
            suggestion: suggestion
          };
          if (fields.riding) setNativeValue(fields.riding, name || '');
          emit('riding', result);
          if (typeof config.onRiding === 'function') config.onRiding(result);
          return result;
        })
        .catch(function (error) {
          emit('error', { error: error });
          if (typeof config.onError === 'function') config.onError(error);
          return null;
        });
    }

    function select(index) {
      var suggestion = state.items[index];
      if (!suggestion) return Promise.resolve(null);

      emit('select', suggestion);
      if (typeof config.onSelect === 'function') config.onSelect(suggestion);

      // A container is a street, not an address: keep the box open and search within it.
      if (suggestion.next === 'search') {
        state.containerId = suggestion.id;
        var sf = suggestion.structuredFormat || {};
        var text = (sf.mainText && sf.mainText.text) || suggestion.text || '';
        programmatic(function () { setNativeValue(input, text + ' '); });
        input.focus();
        if (typeof suggestion.cursor === 'number' && input.setSelectionRange) {
          try { input.setSelectionRange(suggestion.cursor, suggestion.cursor); } catch (e) { /* not a text input */ }
        }
        return search(input.value);
      }

      state.containerId = null;
      fillAddress(suggestion);
      close();
      return resolveRiding(suggestion);
    }

    function onInput() {
      if (state.suppress) return;
      // Any manual edit leaves the drilled-into street.
      state.containerId = null;
      if (state.timer) clearTimeout(state.timer);
      state.timer = setTimeout(function () { search(input.value); }, config.debounce);
    }

    function onKeyDown(event) {
      if (!state.open) {
        if (event.key === 'ArrowDown' && input.value) search(input.value);
        return;
      }
      if (event.key === 'ArrowDown') { event.preventDefault(); setActive(state.active + 1); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); setActive(state.active - 1); }
      else if (event.key === 'Enter') {
        if (state.active >= 0) { event.preventDefault(); select(state.active); }
      } else if (event.key === 'Escape') { close(); }
      else if (event.key === 'Tab') { if (state.active >= 0) select(state.active); else close(); }
    }

    function onPanelMouseDown(event) {
      // mousedown, not click: blur would close the panel before click ever lands.
      var item = event.target && event.target.closest ? event.target.closest('.item') : null;
      if (!item) return;
      event.preventDefault();
      select(parseInt(item.getAttribute('data-index'), 10));
    }

    function onDocumentDown(event) {
      if (event.target === input || ui.host.contains(event.target)) return;
      close();
    }

    input.addEventListener('input', onInput);
    input.addEventListener('keydown', onKeyDown);
    input.addEventListener('blur', function () { setTimeout(close, 120); });
    ui.panel.addEventListener('mousedown', onPanelMouseDown);
    document.addEventListener('mousedown', onDocumentDown);
    global.addEventListener('resize', position);
    global.addEventListener('scroll', position, true);

    if (config.useGeolocation && global.navigator && global.navigator.geolocation) {
      global.navigator.geolocation.getCurrentPosition(function (pos) {
        config.locationBias = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      }, function () { /* denied: rank without proximity */ });
    }

    var instance = {
      input: input,
      fields: fields,
      search: search,
      select: select,
      close: close,
      destroy: function () {
        if (state.timer) clearTimeout(state.timer);
        if (state.loadingTimer) clearTimeout(state.loadingTimer);
        input.removeEventListener('input', onInput);
        input.removeEventListener('keydown', onKeyDown);
        document.removeEventListener('mousedown', onDocumentDown);
        global.removeEventListener('resize', position);
        global.removeEventListener('scroll', position, true);
        if (ui.host.parentNode) ui.host.parentNode.removeChild(ui.host);
        // Hand the field back exactly as we found it: we overwrite the autocomplete attribute, and the
        // original token is what field detection reads, so losing it would break re-attach.
        if (previousAutocomplete !== null) {
          input.setAttribute('autocomplete', previousAutocomplete);
        } else {
          input.removeAttribute('autocomplete');
        }
        input.removeAttribute('role');
        input.removeAttribute('aria-autocomplete');
        input.removeAttribute('aria-expanded');
        input.removeAttribute('aria-controls');
        delete input.__ridingLookup;
      }
    };

    input.__ridingLookup = instance;
    return instance;
  }

  // ---------------------------------------------------------------------------
  // Auto-attach
  // ---------------------------------------------------------------------------

  function scriptOptions() {
    // Auto-attach is an affordance of the <script> tag, configured by its data-* attributes.
    // Loaded any other way (bundled, eval'd, imported) there is no tag to configure, so the
    // explicit RidingLookup.attach() API is the only entry point and we touch nothing.
    if (!document || !document.currentScript) return { auto: false };
    var data = document.currentScript.dataset || {};
    return {
      auto: data.auto !== 'false',
      key: data.key,
      province: data.province,
      limit: data.limit ? parseInt(data.limit, 10) : undefined,
      includeProvince: data.includeProvince === 'true',
      demo: data.demo === 'true',
      endpoint: data.endpoint,
      theme: data.theme
    };
  }

  var scriptConfig = scriptOptions();

  function autoAttach(root) {
    var forms = (root || document).querySelectorAll('form');
    var attached = [];
    for (var i = 0; i < forms.length; i++) {
      var candidate = findField(forms[i], 'address');
      if (!candidate || candidate.__ridingLookup) continue;
      var instance = attach({
        form: forms[i],
        input: candidate,
        key: scriptConfig.key,
        province: scriptConfig.province,
        limit: scriptConfig.limit,
        includeProvince: scriptConfig.includeProvince,
        demo: scriptConfig.demo,
        endpoint: scriptConfig.endpoint,
        theme: scriptConfig.theme
      });
      if (instance) attached.push(instance);
    }
    return attached;
  }

  function start() {
    if (scriptConfig.auto === false) return;
    autoAttach(document);
    // Single-page apps mount their forms after load.
    if (typeof global.MutationObserver === 'function') {
      var observer = new global.MutationObserver(function () { autoAttach(document); });
      observer.observe(document.documentElement || document.body, { childList: true, subtree: true });
    }
  }

  if (document) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', start);
    } else {
      start();
    }
  }

  return {
    version: VERSION,
    attach: attach,
    autoAttach: autoAttach,
    // Exposed for tests and for integrators with unusual forms.
    _internals: {
      findField: findField,
      scoreField: scoreField,
      setNativeValue: setNativeValue,
      setProvince: setProvince,
      highlight: highlight
    }
  };
});
`;
}
