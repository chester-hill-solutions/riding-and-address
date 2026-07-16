// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createEmbedScript, EMBED_VERSION } from '../src/embed';

/**
 * Drives the real served /embed.js in a DOM. The widget source is a string (tsconfig has no DOM
 * lib, since DOM types conflict with @cloudflare/workers-types), so evaluating the exact output
 * is what stands in for typechecking it.
 */

const BASE = 'https://lookup.test';

interface Widget {
  version: string;
  attach: (options: Record<string, unknown>) => WidgetInstance | null;
  autoAttach: (root?: Document | Element) => WidgetInstance[];
  _internals: {
    findField: (scope: Document | Element, kind: string) => HTMLElement | null;
    scoreField: (el: Element, kind: string) => number;
    setNativeValue: (el: Element, value: string) => void;
    setProvince: (el: Element, code: string) => void;
    highlight: (text: string, matches?: Array<{ startOffset: number; endOffset: number }>) => string;
  };
}

interface WidgetInstance {
  input: HTMLInputElement;
  fields: Record<string, HTMLElement | null>;
  search: (value: string) => Promise<unknown[]>;
  select: (index: number) => Promise<unknown>;
  close: () => void;
  destroy: () => void;
}

function loadWidget(): Widget {
  // Fresh module each time: the script no-ops if global.RidingLookup already exists.
  delete (globalThis as Record<string, unknown>).RidingLookup;
   
  new Function(createEmbedScript(BASE)).call(globalThis);
  return (globalThis as unknown as { RidingLookup: Widget }).RidingLookup;
}

function containerSuggestion(overrides: Record<string, unknown> = {}) {
  return {
    id: 'container-1',
    text: 'Main St, Toronto, ON',
    structuredFormat: {
      mainText: { text: 'Main St', matches: [{ startOffset: 0, endOffset: 4 }] },
      secondaryText: { text: 'Toronto, ON' },
    },
    description: 'Toronto, ON',
    types: ['street', 'container'],
    next: 'search',
    dataLevel: 'Street',
    location: { lat: 43.6891, lon: -79.2989 },
    cursor: 8,
    score: 0.7,
    addressCount: 250,
    ...overrides,
  };
}

function leafSuggestion(overrides: Record<string, unknown> = {}) {
  return {
    id: 'addr-1',
    text: '250 Main St, Toronto, ON, M4L 1E7',
    structuredFormat: {
      mainText: { text: '250 Main St' },
      secondaryText: { text: 'Toronto, ON, M4L 1E7' },
    },
    description: 'Toronto, ON, M4L 1E7',
    types: ['address', 'premise'],
    next: 'lookup',
    dataLevel: 'Premise',
    location: { lat: 43.6891, lon: -79.2989 },
    cursor: 11,
    score: 0.94,
    addressComponents: {
      civic_number: '250',
      street_name: 'MAIN',
      street_type: 'ST',
      locality: 'Toronto',
      administrative_area_level_1: 'ON',
      postal_code: 'M4L 1E7',
    },
    ...overrides,
  };
}

/** Routes /api/search and /api/federal to canned bodies and records the URLs hit. */
function mockFetch(routes: { suggestions?: unknown[]; riding?: Record<string, unknown> } = {}) {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (url: string) => {
    calls.push(String(url));
    if (String(url).includes('/api/search')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ suggestions: routes.suggestions ?? [], provinces: ['ON'] }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => routes.riding ?? { properties: { ENGLISH_NAME: 'Toronto Centre' }, point: {} },
    };
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('served script', () => {
  it('exposes a versioned global and does not redefine it on double-include', () => {
    const widget = loadWidget();
    expect(widget.version).toBe(EMBED_VERSION);

    const marker = { sentinel: true };
    (globalThis as Record<string, unknown>).RidingLookup = marker;
    new Function(createEmbedScript(BASE)).call(globalThis);
    expect((globalThis as Record<string, unknown>).RidingLookup).toBe(marker);
  });

  it('contains no unresolved template interpolation', () => {
    const source = createEmbedScript(BASE);
    expect(source).not.toContain('${');
    expect(source).toContain(JSON.stringify(BASE));
  });
});

describe('field detection', () => {
  it('prefers the autocomplete attribute over name guessing', () => {
    document.body.innerHTML = `
      <form>
        <input name="something-opaque" autocomplete="street-address" id="real">
        <input name="address" id="decoy">
      </form>`;
    const found = loadWidget()._internals.findField(document, 'address');
    expect(found?.id).toBe('real');
  });

  it('handles section-prefixed autocomplete tokens', () => {
    document.body.innerHTML = `<form><input id="a" autocomplete="shipping address-line1"></form>`;
    expect(loadWidget()._internals.findField(document, 'address')?.id).toBe('a');
  });

  it('does not mistake an email field for an address', () => {
    document.body.innerHTML = `<form><input name="email_address" id="e" type="email"></form>`;
    expect(loadWidget()._internals.findField(document, 'address')).toBeNull();
  });

  it('does not pick address line 2, apartment, or country', () => {
    document.body.innerHTML = `
      <form>
        <input name="address_line_2" id="l2">
        <input name="address2" id="a2">
        <input name="apt" id="apt">
        <input name="country" id="c">
      </form>`;
    expect(loadWidget()._internals.findField(document, 'address')).toBeNull();
  });

  it('picks line 1 out of a split address form', () => {
    document.body.innerHTML = `
      <form>
        <input name="addr1" id="one">
        <input name="addr2" id="two">
      </form>`;
    expect(loadWidget()._internals.findField(document, 'address')?.id).toBe('one');
  });

  it('finds city, province and postal across common namings', () => {
    document.body.innerHTML = `
      <form>
        <input name="street_address" id="a">
        <input name="town" id="city">
        <select name="prov" id="prov"></select>
        <input name="zip" id="pc">
      </form>`;
    const w = loadWidget()._internals;
    expect(w.findField(document, 'city')?.id).toBe('city');
    expect(w.findField(document, 'province')?.id).toBe('prov');
    expect(w.findField(document, 'postal')?.id).toBe('pc');
  });

  it('reads a label when the input itself is unnamed', () => {
    document.body.innerHTML = `
      <form>
        <label for="x">Street Address</label>
        <input id="x">
      </form>`;
    expect(loadWidget()._internals.findField(document, 'address')?.id).toBe('x');
  });

  it('ignores hidden, disabled and non-text inputs', () => {
    document.body.innerHTML = `
      <form>
        <input name="address" type="checkbox" id="cb">
        <input name="address" id="disabled" disabled>
      </form>`;
    expect(loadWidget()._internals.findField(document, 'address')).toBeNull();
  });

  it('matches abbreviated province and postal namings', () => {
    document.body.innerHTML = `
      <form>
        <input name="prov" id="p">
        <input name="pcode" id="q">
      </form>`;
    const w = loadWidget()._internals;
    expect(w.findField(document, 'province')?.id).toBe('p');
  });

  it('does not match a field that merely contains a keyword as a substring', () => {
    // "improve" contains prov, "capacity" contains city, "Georgetown" contains town.
    document.body.innerHTML = `
      <form>
        <input name="improve_notes" id="a">
        <input name="capacity" id="b">
        <input name="georgetown_branch" id="c">
      </form>`;
    const w = loadWidget()._internals;
    expect(w.findField(document, 'province')).toBeNull();
    expect(w.findField(document, 'city')).toBeNull();
  });

  it('lets an explicit override win over detection', () => {
    document.body.innerHTML = `
      <form>
        <input name="address" id="guessed">
        <input name="opaque" id="chosen">
      </form>`;
    const instance = loadWidget().attach({ input: '#chosen' });
    expect(instance?.input.id).toBe('chosen');
  });
});

describe('writing values frameworks notice', () => {
  it('goes through the prototype setter and fires input + change', () => {
    document.body.innerHTML = `<input id="i">`;
    const input = document.getElementById('i') as HTMLInputElement;
    const events: string[] = [];
    input.addEventListener('input', () => events.push('input'));
    input.addEventListener('change', () => events.push('change'));

    loadWidget()._internals.setNativeValue(input, 'hello');

    expect(input.value).toBe('hello');
    expect(events).toEqual(['input', 'change']);
  });

  it('updates a React-style controlled input that shadows value with its own setter', () => {
    // React defines an own `value` property on the node and dedupes via _valueTracker; a naive
    // `el.value = x` writes the DOM but React never re-renders, so the value silently reverts.
    document.body.innerHTML = `<input id="i">`;
    const input = document.getElementById('i') as HTMLInputElement & {
      _valueTracker?: { setValue: (v: string) => void; getValue: () => string };
    };

    let tracked = '';
    input._valueTracker = {
      setValue: (v: string) => { tracked = v; },
      getValue: () => tracked,
    };
    let ownSetterCalls = 0;
    Object.defineProperty(input, 'value', {
      configurable: true,
      get() { return this.getAttribute('data-v') || ''; },
      set(_v: string) { ownSetterCalls++; },
    });

    loadWidget()._internals.setNativeValue(input, 'from-widget');

    // The own setter (React's) must be bypassed, and the tracker reset so React sees a change.
    expect(ownSetterCalls).toBe(0);
    expect(tracked).not.toBe('from-widget');
  });

  it('bubbles the input event so a delegated framework listener sees it', () => {
    document.body.innerHTML = `<form id="f"><input id="i"></form>`;
    const input = document.getElementById('i') as HTMLInputElement;
    const seen = vi.fn();
    document.getElementById('f')!.addEventListener('input', seen);

    loadWidget()._internals.setNativeValue(input, 'x');
    expect(seen).toHaveBeenCalled();
  });
});

describe('province select', () => {
  it('matches an option by code', () => {
    document.body.innerHTML = `<select id="s"><option value="ON">ON</option><option value="QC">QC</option></select>`;
    const select = document.getElementById('s') as HTMLSelectElement;
    loadWidget()._internals.setProvince(select, 'ON');
    expect(select.value).toBe('ON');
  });

  it('matches an option whose text is the full province name', () => {
    document.body.innerHTML = `
      <select id="s">
        <option value="">Choose</option>
        <option value="35">Ontario</option>
        <option value="24">Quebec</option>
      </select>`;
    const select = document.getElementById('s') as HTMLSelectElement;
    loadWidget()._internals.setProvince(select, 'ON');
    expect(select.value).toBe('35');
  });

  it('leaves the select alone when no option matches', () => {
    document.body.innerHTML = `<select id="s"><option value="XX">Nowhere</option></select>`;
    const select = document.getElementById('s') as HTMLSelectElement;
    loadWidget()._internals.setProvince(select, 'ON');
    expect(select.value).toBe('XX');
  });
});

describe('highlight', () => {
  it('bolds the matched range', () => {
    expect(loadWidget()._internals.highlight('Main St', [{ startOffset: 0, endOffset: 4 }]))
      .toBe('<b>Main</b> St');
  });

  it('escapes markup in the text and in the matched span', () => {
    const out = loadWidget()._internals.highlight('<img src=x onerror=alert(1)>', []);
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;img');
  });
});

describe('search behaviour', () => {
  it('does not call the API below the minimum length', async () => {
    document.body.innerHTML = `<form><input id="a" name="address"></form>`;
    const { fetchMock } = mockFetch();
    const instance = loadWidget().attach({ input: '#a' })!;

    await instance.search('ma');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the province and limit hints', async () => {
    document.body.innerHTML = `<form><input id="a" name="address"></form>`;
    const { calls } = mockFetch({ suggestions: [containerSuggestion()] });
    const instance = loadWidget().attach({ input: '#a', province: 'ON', limit: 5 })!;

    await instance.search('main st');
    expect(calls[0]).toContain('/api/search?q=main%20st');
    expect(calls[0]).toContain('province=ON');
    expect(calls[0]).toContain('limit=5');
  });

  it('sends locationBias when configured', async () => {
    document.body.innerHTML = `<form><input id="a" name="address"></form>`;
    const { calls } = mockFetch({ suggestions: [] });
    const instance = loadWidget().attach({ input: '#a', locationBias: { lat: 43.65, lon: -79.38 } })!;

    await instance.search('main st');
    expect(decodeURIComponent(calls[0])).toContain('locationBias=43.65,-79.38');
  });

  it('renders suggestions into the dropdown', async () => {
    document.body.innerHTML = `<form><input id="a" name="address"></form>`;
    mockFetch({ suggestions: [containerSuggestion()] });
    const instance = loadWidget().attach({ input: '#a' })!;

    await instance.search('main st');

    const host = document.querySelector('[data-riding-lookup]')!;
    const panel = host.shadowRoot!.querySelector('.panel')!;
    expect(panel.getAttribute('data-open')).toBe('true');
    expect(panel.textContent).toContain('Main St');
    expect(panel.textContent).toContain('250'); // addressCount pill
    expect(instance.input.getAttribute('aria-expanded')).toBe('true');
  });

  it('renders the dropdown in a shadow root so host CSS cannot break it', async () => {
    document.body.innerHTML = `<form><input id="a" name="address"></form>`;
    mockFetch({ suggestions: [containerSuggestion()] });
    await loadWidget().attach({ input: '#a' })!.search('main st');

    const host = document.querySelector('[data-riding-lookup]') as HTMLElement;
    expect(host.shadowRoot).toBeTruthy();
    expect(host.querySelector('.panel')).toBeNull();
  });

  it('escapes an addressCount smuggling markup, like every other field', async () => {
    document.body.innerHTML = `<form><input id="a" name="address"></form>`;
    mockFetch({ suggestions: [containerSuggestion({ addressCount: '<img src=x onerror=alert(1)>' })] });
    await loadWidget().attach({ input: '#a' })!.search('main st');

    const panel = document.querySelector('[data-riding-lookup]')!.shadowRoot!.querySelector('.panel')!;
    expect(panel.querySelector('img')).toBeNull();
    expect(panel.querySelector('.count')!.textContent).toContain('<img');
  });
});

describe('empty state', () => {
  it('shows "No matching addresses" instead of closing when a valid query has no results', async () => {
    document.body.innerHTML = `<form><input id="a" name="address"></form>`;
    mockFetch({ suggestions: [] });
    const instance = loadWidget().attach({ input: '#a' })!;

    await instance.search('main st');

    const root = document.querySelector('[data-riding-lookup]')!.shadowRoot!;
    expect(root.querySelector('.panel')!.getAttribute('data-open')).toBe('true');
    expect(root.querySelector('.empty')!.textContent).toBe('No matching addresses');
    expect(root.querySelector('.status')!.textContent).toBe('No results');
    expect(instance.input.getAttribute('aria-expanded')).toBe('true');
  });

  it('still closes silently below the minimum length, where nothing was searched', async () => {
    document.body.innerHTML = `<form><input id="a" name="address"></form>`;
    mockFetch({ suggestions: [] });
    const instance = loadWidget().attach({ input: '#a' })!;

    await instance.search('main st'); // opens the empty state
    await instance.search('ma'); // below minLength: not a "no results" situation

    const panel = document.querySelector('[data-riding-lookup]')!.shadowRoot!.querySelector('.panel')!;
    expect(panel.getAttribute('data-open')).toBe('false');
    expect(panel.querySelector('.empty')).toBeNull();
  });
});

describe('loading state', () => {
  it('shows the searching indicator only once the response is slow, and clears it on resolve', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `<form><input id="a" name="address"></form>`;
    let resolveFetch!: (value: unknown) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise((resolve) => { resolveFetch = resolve; })));
    const instance = loadWidget().attach({ input: '#a' })!;

    const pending = instance.search('main st');
    const panel = document.querySelector('[data-riding-lookup]')!.shadowRoot!.querySelector('.panel')!;
    expect(panel.hasAttribute('data-loading')).toBe(false);

    vi.advanceTimersByTime(250);
    expect(panel.getAttribute('data-loading')).toBe('true');
    // Opened from closed, so the indicator is actually visible.
    expect(panel.getAttribute('data-open')).toBe('true');

    resolveFetch({ ok: true, status: 200, json: async () => ({ suggestions: [containerSuggestion()] }) });
    await pending;
    expect(panel.hasAttribute('data-loading')).toBe(false);
    expect(panel.getAttribute('data-open')).toBe('true');
    vi.useRealTimers();
  });

  it('never flashes the indicator for a fast response', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `<form><input id="a" name="address"></form>`;
    mockFetch({ suggestions: [containerSuggestion()] });
    const instance = loadWidget().attach({ input: '#a' })!;

    await instance.search('main st');
    vi.advanceTimersByTime(1000);

    const panel = document.querySelector('[data-riding-lookup]')!.shadowRoot!.querySelector('.panel')!;
    expect(panel.hasAttribute('data-loading')).toBe(false);
    vi.useRealTimers();
  });

  it('clears the indicator when the search fails', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `<form><input id="a" name="address"></form>`;
    let rejectFetch!: (reason: unknown) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise((_resolve, reject) => { rejectFetch = reject; })));
    const instance = loadWidget().attach({ input: '#a' })!;

    const pending = instance.search('main st');
    vi.advanceTimersByTime(250);
    const panel = document.querySelector('[data-riding-lookup]')!.shadowRoot!.querySelector('.panel')!;
    expect(panel.getAttribute('data-loading')).toBe('true');

    rejectFetch(new Error('network down'));
    await pending;
    expect(panel.hasAttribute('data-loading')).toBe(false);
    expect(panel.querySelector('.error')).toBeTruthy();
    vi.useRealTimers();
  });
});

describe('theming', () => {
  it('ships dark styles gated on prefers-color-scheme, overridable per host', () => {
    document.body.innerHTML = `<form><input id="a" name="address"></form>`;
    loadWidget().attach({ input: '#a' });

    const css = document.querySelector('[data-riding-lookup]')!.shadowRoot!.querySelector('style')!.textContent!;
    expect(css).toContain('@media (prefers-color-scheme:dark)');
    // The media query yields to an explicit light pin; an explicit dark pin wins over a light OS.
    expect(css).toContain(':host(:not([data-theme="light"]))');
    expect(css).toContain(':host([data-theme="dark"])');
  });

  it('pins the palette when the theme option is set', () => {
    document.body.innerHTML = `<form><input id="a" name="address"></form>`;
    loadWidget().attach({ input: '#a', theme: 'dark' });
    expect(document.querySelector('[data-riding-lookup]')!.getAttribute('data-theme')).toBe('dark');
  });

  it('ignores an unknown theme value and follows the OS preference', () => {
    document.body.innerHTML = `<form><input id="a" name="address"></form>`;
    loadWidget().attach({ input: '#a', theme: 'blue' });
    expect(document.querySelector('[data-riding-lookup]')!.hasAttribute('data-theme')).toBe(false);
  });
});

describe('selection', () => {
  it('drills into a container instead of closing', async () => {
    document.body.innerHTML = `<form><input id="a" name="address"></form>`;
    const { calls } = mockFetch({ suggestions: [containerSuggestion()] });
    const instance = loadWidget().attach({ input: '#a' })!;

    await instance.search('main st');
    await instance.select(0);
    await flush();

    // Re-queries scoped to the container rather than resolving a riding.
    expect(calls.some((c) => c.includes('containerId=container-1'))).toBe(true);
    expect(calls.some((c) => c.includes('/api/federal'))).toBe(false);
    expect(instance.input.value).toBe('Main St ');
  });

  it('drills into a building container the same way it drills into a street', async () => {
    // A building is just another next:"search" row, so the widget needs no special case for
    // units -- this test is what makes that claim true rather than assumed.
    const building = containerSuggestion({
      id: 'building-560',
      text: '560 Birchmount Rd, Scarborough, ON',
      structuredFormat: {
        mainText: { text: '560 Birchmount Rd' },
        secondaryText: { text: 'Scarborough, ON' },
      },
      types: ['address', 'building', 'container'],
      dataLevel: 'Premise',
      addressCount: 40,
      unitCount: 40,
    });

    document.body.innerHTML = `<form><input id="a" name="address"></form>`;
    const { calls } = mockFetch({ suggestions: [building] });
    const instance = loadWidget().attach({ input: '#a' })!;

    await instance.search('560 birchmount');
    await instance.select(0);
    await flush();

    expect(calls.some((c) => c.includes('containerId=building-560'))).toBe(true);
    // Not a resolution: no riding lookup fires for a building.
    expect(calls.some((c) => c.includes('/api/federal'))).toBe(false);
    expect(instance.input.value).toBe('560 Birchmount Rd ');
  });

  it('fills every bound field from a resolved address', async () => {
    document.body.innerHTML = `
      <form>
        <input id="a" name="address">
        <input id="city" name="city">
        <select id="prov" name="province"><option value="">--</option><option value="ON">Ontario</option></select>
        <input id="pc" name="postal_code">
      </form>`;
    mockFetch({ suggestions: [leafSuggestion()] });
    const instance = loadWidget().attach({ input: '#a' })!;

    await instance.search('250 main st');
    await instance.select(0);
    await flush();

    expect((document.getElementById('a') as HTMLInputElement).value).toBe('250 Main St');
    expect((document.getElementById('city') as HTMLInputElement).value).toBe('Toronto');
    expect((document.getElementById('prov') as HTMLSelectElement).value).toBe('ON');
    expect((document.getElementById('pc') as HTMLInputElement).value).toBe('M4L 1E7');
  });

  it('resolves the riding from the suggestion point and emits it', async () => {
    document.body.innerHTML = `<form><input id="a" name="address"></form>`;
    const { calls } = mockFetch({ suggestions: [leafSuggestion()] });
    const instance = loadWidget().attach({ input: '#a' })!;

    const received: Array<Record<string, unknown>> = [];
    instance.input.addEventListener('ridinglookup:riding', (event) => {
      received.push((event as CustomEvent).detail);
    });

    await instance.search('250 main st');
    await instance.select(0);
    await flush();

    const lookup = calls.find((c) => c.includes('/api/federal'));
    expect(lookup).toContain('lat=43.6891');
    expect(lookup).toContain('lon=-79.2989');
    expect(received[0].riding).toBe('Toronto Centre');
  });

  it('uses /api/combined when includeProvince is set', async () => {
    document.body.innerHTML = `<form><input id="a" name="address"></form>`;
    const { calls } = mockFetch({ suggestions: [leafSuggestion()] });
    const instance = loadWidget().attach({ input: '#a', includeProvince: true })!;

    await instance.search('250 main st');
    await instance.select(0);
    await flush();

    expect(calls.some((c) => c.includes('/api/combined') && c.includes('include_province=true'))).toBe(true);
  });

  it('writes the riding into a bound hidden field', async () => {
    document.body.innerHTML = `
      <form>
        <input id="a" name="address">
        <input id="riding" type="hidden">
      </form>`;
    mockFetch({ suggestions: [leafSuggestion()] });
    const instance = loadWidget().attach({ input: '#a', fields: { riding: '#riding' } })!;

    await instance.search('250 main st');
    await instance.select(0);
    await flush();

    expect((document.getElementById('riding') as HTMLInputElement).value).toBe('Toronto Centre');
  });

  it('emits select before any riding lookup', async () => {
    document.body.innerHTML = `<form><input id="a" name="address"></form>`;
    mockFetch({ suggestions: [leafSuggestion()] });
    const instance = loadWidget().attach({ input: '#a' })!;
    const order: string[] = [];
    instance.input.addEventListener('ridinglookup:select', () => order.push('select'));
    instance.input.addEventListener('ridinglookup:riding', () => order.push('riding'));

    await instance.search('250 main st');
    await instance.select(0);
    await flush();

    expect(order).toEqual(['select', 'riding']);
  });

  it('does not let its own fill re-trigger a search', async () => {
    // Regression: setNativeValue dispatches a real 'input' event (that is the point -- frameworks
    // must notice), which re-entered the widget's own input handler. Filling a selected address
    // then scheduled another search and re-opened the dropdown the user had just dismissed.
    vi.useFakeTimers();
    document.body.innerHTML = `<form><input id="a" name="address"></form>`;
    const { fetchMock } = mockFetch({ suggestions: [leafSuggestion()] });
    const instance = loadWidget().attach({ input: '#a' })!;

    await instance.search('250 main st');
    const afterSearch = fetchMock.mock.calls.length;
    await instance.select(0);
    vi.runAllTimers();
    await Promise.resolve();

    // Only the riding lookup should follow the select -- no second search.
    const searches = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/api/search'));
    expect(searches).toHaveLength(1);
    expect(fetchMock.mock.calls.length).toBe(afterSearch + 1);
    expect(instance.input.getAttribute('aria-expanded')).toBe('false');
    vi.useRealTimers();
  });

  it('leaves fields untouched when fill is false', async () => {
    document.body.innerHTML = `<form><input id="a" name="address"><input id="city" name="city"></form>`;
    mockFetch({ suggestions: [leafSuggestion()] });
    const instance = loadWidget().attach({ input: '#a', fill: false })!;

    await instance.search('250 main st');
    await instance.select(0);
    await flush();

    expect((document.getElementById('city') as HTMLInputElement).value).toBe('');
  });
});

describe('failure handling', () => {
  it('emits an error event and renders an inline failure row when search fails', async () => {
    document.body.innerHTML = `<form><input id="a" name="address"></form>`;
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
    const instance = loadWidget().attach({ input: '#a' })!;
    const errors: unknown[] = [];
    instance.input.addEventListener('ridinglookup:error', (e) => errors.push((e as CustomEvent).detail));

    const results = await instance.search('main st');

    expect(results).toEqual([]);
    expect(errors).toHaveLength(1);
    // The failure is shown inline, not just emitted: a silent close reads as "no results".
    const root = document.querySelector('[data-riding-lookup]')!.shadowRoot!;
    expect(root.querySelector('.panel')!.getAttribute('data-open')).toBe('true');
    expect(root.querySelector('.error')!.textContent).toContain('Search unavailable');
    expect(root.querySelector('.status')!.textContent).toBe('Search unavailable');
    expect(instance.input.getAttribute('aria-expanded')).toBe('true');
  });

  it('replaces the failure row with results once a later search succeeds', async () => {
    document.body.innerHTML = `<form><input id="a" name="address"></form>`;
    let fail = true;
    vi.stubGlobal('fetch', vi.fn(async () => {
      if (fail) return { ok: false, status: 503, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({ suggestions: [containerSuggestion()] }) };
    }));
    const instance = loadWidget().attach({ input: '#a' })!;

    await instance.search('main st');
    fail = false;
    await instance.search('main st e');

    const root = document.querySelector('[data-riding-lookup]')!.shadowRoot!;
    expect(root.querySelector('.error')).toBeNull();
    expect(root.querySelector('.item')).toBeTruthy();
  });

  it('does not throw when the riding lookup fails after a good search', async () => {
    document.body.innerHTML = `<form><input id="a" name="address"></form>`;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('/api/search')) {
        return { ok: true, status: 200, json: async () => ({ suggestions: [leafSuggestion()] }) };
      }
      return { ok: false, status: 500, json: async () => ({}) };
    }));
    const instance = loadWidget().attach({ input: '#a' })!;
    const errors: unknown[] = [];
    instance.input.addEventListener('ridinglookup:error', (e) => errors.push((e as CustomEvent).detail));

    await instance.search('250 main st');
    await expect(instance.select(0)).resolves.toBeNull();
    await flush();

    // The address still filled; only the riding is missing.
    expect(instance.input.value).toBe('250 Main St');
    expect(errors).toHaveLength(1);
  });
});

describe('auto-attach', () => {
  it('attaches to an address field in each form without configuration', () => {
    document.body.innerHTML = `
      <form id="one"><input name="street_address"></form>
      <form id="two"><input autocomplete="address-line1"></form>
      <form id="three"><input name="nickname"></form>`;
    const attached = loadWidget().autoAttach(document);
    expect(attached).toHaveLength(2);
  });

  it('does not attach twice to the same input', () => {
    document.body.innerHTML = `<form><input name="address"></form>`;
    const widget = loadWidget();
    expect(widget.autoAttach(document)).toHaveLength(1);
    expect(widget.autoAttach(document)).toHaveLength(0);
  });

  it('turns off browser autofill so it cannot cover the dropdown', () => {
    document.body.innerHTML = `<form><input id="a" name="address"></form>`;
    loadWidget().attach({ input: '#a' });
    expect((document.getElementById('a') as HTMLInputElement).getAttribute('autocomplete')).toBe('off');
  });

  it('restores the original autocomplete token on destroy, so re-attach can still detect', async () => {
    // attach() overwrites `autocomplete`, which is the highest-signal thing detection reads.
    // Without restoring it, destroy-then-attach would fall back to name guessing and could pick
    // a different field than the first attach did.
    document.body.innerHTML = `<form><input id="a" autocomplete="street-address"></form>`;
    const widget = loadWidget();
    const instance = widget.attach({ input: '#a' })!;
    expect(instance.input.getAttribute('autocomplete')).toBe('off');

    instance.destroy();
    expect(document.getElementById('a')!.getAttribute('autocomplete')).toBe('street-address');
    expect(widget._internals.findField(document, 'address')?.id).toBe('a');
  });

  it('leaves no autocomplete attribute behind if there was none', () => {
    document.body.innerHTML = `<form><input id="a" name="address"></form>`;
    const instance = loadWidget().attach({ input: '#a' })!;
    instance.destroy();
    expect(document.getElementById('a')!.hasAttribute('autocomplete')).toBe(false);
  });

  it('destroy removes the panel and the listeners', async () => {
    document.body.innerHTML = `<form><input id="a" name="address"></form>`;
    mockFetch({ suggestions: [containerSuggestion()] });
    const instance = loadWidget().attach({ input: '#a' })!;
    await instance.search('main st');

    expect(document.querySelector('[data-riding-lookup]')).toBeTruthy();
    instance.destroy();
    expect(document.querySelector('[data-riding-lookup]')).toBeNull();
  });
});

describe('accessibility', () => {
  it('marks the input up as a combobox wired to the listbox', async () => {
    document.body.innerHTML = `<form><input id="a" name="address"></form>`;
    mockFetch({ suggestions: [containerSuggestion(), leafSuggestion()] });
    const instance = loadWidget().attach({ input: '#a' })!;

    expect(instance.input.getAttribute('role')).toBe('combobox');
    expect(instance.input.getAttribute('aria-autocomplete')).toBe('list');

    await instance.search('main');
    const listId = instance.input.getAttribute('aria-controls');
    const host = document.querySelector('[data-riding-lookup]')!;
    expect(host.shadowRoot!.getElementById(listId!)).toBeTruthy();
  });

  it('labels the listbox for screen readers', () => {
    document.body.innerHTML = `<form><input id="a" name="address"></form>`;
    loadWidget().attach({ input: '#a' });
    const panel = document.querySelector('[data-riding-lookup]')!.shadowRoot!.querySelector('.panel')!;
    expect(panel.getAttribute('aria-label')).toBe('Address suggestions');
  });

  it('announces the result count through a polite live region', async () => {
    document.body.innerHTML = `<form><input id="a" name="address"></form>`;
    mockFetch({ suggestions: [containerSuggestion(), leafSuggestion()] });
    const instance = loadWidget().attach({ input: '#a' })!;

    const status = document.querySelector('[data-riding-lookup]')!.shadowRoot!.querySelector('.status')!;
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.getAttribute('role')).toBe('status');

    await instance.search('main');
    expect(status.textContent).toBe('2 suggestions');
  });

  it('uses the singular for exactly one suggestion', async () => {
    document.body.innerHTML = `<form><input id="a" name="address"></form>`;
    mockFetch({ suggestions: [leafSuggestion()] });
    const instance = loadWidget().attach({ input: '#a' })!;

    await instance.search('250 main');
    const status = document.querySelector('[data-riding-lookup]')!.shadowRoot!.querySelector('.status')!;
    expect(status.textContent).toBe('1 suggestion');
  });

  it('moves the active option with the arrow keys and reflects it in aria-activedescendant', async () => {
    document.body.innerHTML = `<form><input id="a" name="address"></form>`;
    mockFetch({ suggestions: [containerSuggestion(), leafSuggestion()] });
    const instance = loadWidget().attach({ input: '#a' })!;
    await instance.search('main');

    instance.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    const first = instance.input.getAttribute('aria-activedescendant');
    expect(first).toMatch(/-0$/);

    instance.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(instance.input.getAttribute('aria-activedescendant')).toMatch(/-1$/);

    // Wraps around rather than dead-ending.
    instance.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(instance.input.getAttribute('aria-activedescendant')).toMatch(/-0$/);
  });

  it('closes on Escape', async () => {
    document.body.innerHTML = `<form><input id="a" name="address"></form>`;
    mockFetch({ suggestions: [containerSuggestion()] });
    const instance = loadWidget().attach({ input: '#a' })!;
    await instance.search('main');

    instance.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(instance.input.getAttribute('aria-expanded')).toBe('false');
  });
});
