import { useEffect, useRef, useState, type FormEvent } from 'react';

type TryRidingFormProps = {
  apiBaseUrl: string;
  /** Public browser key (pk_*) for /api/search when API_KEYS is enabled. */
  demoBrowserKey?: string;
};

type RidingResult = {
  federal: string | null;
  provincial: string | null;
  municipality: string | null;
  fedNum: string | null;
  queryLabel: string;
};

type Sample = {
  label: string;
  query: string;
};

type EmbedSuggestion = {
  next?: string;
  text?: string;
  structuredFormat?: {
    mainText?: { text?: string };
    secondaryText?: { text?: string };
  };
  addressComponents?: {
    locality?: string;
  };
  location?: { lat: number; lon: number };
};

type EmbedRidingDetail = {
  riding?: string | null;
  properties?: Record<string, unknown>;
  provinceData?: { properties?: Record<string, unknown>; riding?: string | null };
  suggestion?: EmbedSuggestion;
};

type EmbedInstance = {
  input: HTMLInputElement;
  search: (value: string) => Promise<unknown>;
  destroy: () => void;
};

type RidingLookupApi = {
  attach: (options: Record<string, unknown>) => EmbedInstance | null;
};

const SAMPLES: Sample[] = [
  { label: 'Ottawa', query: '24 Sussex' },
  { label: 'Toronto', query: '100 Queen St W' },
  { label: 'Vancouver', query: '800 Robson' },
];

const EMBED_SCRIPT_ATTR = 'data-cancoder-embed';

function ridingName(properties: Record<string, unknown> | undefined): string | null {
  if (!properties) return null;
  const candidates = [
    properties.FED_NAME,
    properties.ED_NAMEE,
    properties.ENGLISH_NAME,
    properties.NAME,
    properties.riding,
  ];
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function fedNumFrom(properties: Record<string, unknown> | undefined): string | null {
  if (!properties) return null;
  const value = properties.FED_NUM ?? properties.FEDNUM;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
}

function suggestionLabel(suggestion: EmbedSuggestion | undefined): string {
  if (!suggestion) return '';
  const main = suggestion.structuredFormat?.mainText?.text?.trim();
  const secondary = suggestion.structuredFormat?.secondaryText?.text?.trim();
  if (main && secondary) return `${main}, ${secondary}`;
  if (main) return main;
  return suggestion.text?.trim() || '';
}

function loadEmbedScript(apiBaseUrl: string): Promise<RidingLookupApi> {
  const existing = window.RidingLookup;
  if (existing) return Promise.resolve(existing);

  const already = document.querySelector<HTMLScriptElement>(`script[${EMBED_SCRIPT_ATTR}]`);
  if (already) {
    return new Promise((resolve, reject) => {
      const check = () => {
        if (window.RidingLookup) resolve(window.RidingLookup);
        else reject(new Error('Embed script loaded without RidingLookup'));
      };
      if (window.RidingLookup) {
        check();
        return;
      }
      already.addEventListener('load', check, { once: true });
      already.addEventListener(
        'error',
        () => reject(new Error('Failed to load embed script')),
        { once: true }
      );
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${apiBaseUrl}/embed.js`;
    script.async = true;
    script.setAttribute(EMBED_SCRIPT_ATTR, '1');
    // Manual attach — React owns the form lifecycle.
    script.dataset.auto = 'false';
    script.onload = () => {
      if (window.RidingLookup) resolve(window.RidingLookup);
      else reject(new Error('Embed script loaded without RidingLookup'));
    };
    script.onerror = () => reject(new Error('Failed to load embed script'));
    document.head.appendChild(script);
  });
}

declare global {
  interface Window {
    RidingLookup?: RidingLookupApi;
  }
}

export function TryRidingForm({ apiBaseUrl, demoBrowserKey }: TryRidingFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const widgetRef = useRef<EmbedInstance | null>(null);
  const awaitingRidingRef = useRef(false);

  const [widgetReady, setWidgetReady] = useState(false);
  const [status, setStatus] = useState<'idle' | 'ready' | 'loading' | 'ok' | 'empty' | 'error'>(
    'idle'
  );
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<RidingResult | null>(null);
  const [activeSample, setActiveSample] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const form = formRef.current;
    const input = inputRef.current;
    if (!form || !input) return;

    const onSelect = (event: Event) => {
      const suggestion = (event as CustomEvent<EmbedSuggestion>).detail;
      // Street containers keep the dropdown open; no riding yet.
      if (!suggestion || suggestion.next === 'search' || !suggestion.location) return;
      awaitingRidingRef.current = true;
      setStatus('loading');
      setMessage('');
      setActiveSample(null);
    };

    const onRiding = (event: Event) => {
      awaitingRidingRef.current = false;
      const detail = (event as CustomEvent<EmbedRidingDetail>).detail;
      const federal =
        (typeof detail.riding === 'string' && detail.riding.trim() ? detail.riding.trim() : null) ||
        ridingName(detail.properties);
      const provincial =
        ridingName(detail.provinceData?.properties) ||
        (typeof detail.provinceData?.riding === 'string' && detail.provinceData.riding.trim()
          ? detail.provinceData.riding.trim()
          : null);
      const locality = detail.suggestion?.addressComponents?.locality?.trim() || null;
      const queryLabel = suggestionLabel(detail.suggestion);

      if (!federal && !provincial) {
        setStatus('empty');
        setResult(null);
        setMessage('No riding found for that address.');
        return;
      }

      setResult({
        federal,
        provincial,
        municipality: locality,
        fedNum: fedNumFrom(detail.properties),
        queryLabel,
      });
      setStatus('ok');
      setMessage('');
    };

    const onError = () => {
      // Search failures stay in the widget dropdown; only post-select riding errors update the panel.
      if (!awaitingRidingRef.current) return;
      awaitingRidingRef.current = false;
      setStatus('error');
      setResult(null);
      setMessage('Lookup failed — try another address.');
    };

    void (async () => {
      try {
        const api = await loadEmbedScript(apiBaseUrl);
        if (cancelled) return;

        const instance = api.attach({
          form,
          input,
          endpoint: apiBaseUrl,
          key: demoBrowserKey || undefined,
          includeProvince: true,
          demo: true,
          fill: true,
          theme: 'light',
        });
        if (!instance) {
          setStatus('error');
          setMessage('Could not attach the autocomplete widget.');
          return;
        }

        widgetRef.current = instance;
        instance.input.addEventListener('ridinglookup:select', onSelect);
        instance.input.addEventListener('ridinglookup:riding', onRiding);
        instance.input.addEventListener('ridinglookup:error', onError);
        setWidgetReady(true);
        setStatus('ready');
      } catch {
        if (cancelled) return;
        setWidgetReady(false);
        setStatus('error');
        setMessage('Autocomplete unavailable — is the API running with suggest enabled?');
      }
    })();

    return () => {
      cancelled = true;
      const instance = widgetRef.current;
      if (instance) {
        instance.input.removeEventListener('ridinglookup:select', onSelect);
        instance.input.removeEventListener('ridinglookup:riding', onRiding);
        instance.input.removeEventListener('ridinglookup:error', onError);
        instance.destroy();
        widgetRef.current = null;
      }
      setWidgetReady(false);
    };
  }, [apiBaseUrl, demoBrowserKey]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
  }

  function runSample(sample: Sample) {
    const instance = widgetRef.current;
    const input = inputRef.current;
    if (!instance || !input) return;
    setActiveSample(sample.label);
    setStatus('ready');
    setMessage('');
    setResult(null);
    // Native setter so the embed's input handler sees the value.
    const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    proto?.set?.call(input, sample.query);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
    void instance.search(sample.query);
  }

  const heading = result?.federal || result?.provincial;
  const showIdle = status === 'idle' || status === 'ready';

  return (
    <div className="try-embed">
      <form className="try-embed__form" ref={formRef} onSubmit={onSubmit}>
        <label htmlFor="try-address">Canadian address</label>
        <div className="try-embed__row">
          <input
            ref={inputRef}
            id="try-address"
            name="address"
            autoComplete="street-address"
            placeholder="Start typing an address…"
            disabled={!widgetReady}
          />
        </div>
        <div className="try-embed__samples" role="group" aria-label="Sample searches">
          {SAMPLES.map((sample) => (
            <button
              key={sample.label}
              type="button"
              className={
                activeSample === sample.label
                  ? 'try-embed__sample is-active'
                  : 'try-embed__sample'
              }
              onClick={() => runSample(sample)}
              disabled={!widgetReady}
            >
              {sample.label}
            </button>
          ))}
        </div>
        <p className="try-embed__hint">
          Same <code>/embed.js</code> widget you can drop into any form.
        </p>
      </form>

      <div
        className={`try-embed__result try-embed__result--${status === 'loading' ? 'loading' : status}`}
        aria-live="polite"
        aria-busy={status === 'loading' || undefined}
      >
        {showIdle ? (
          <p className="try-embed__placeholder">
            {status === 'idle' ? 'Loading autocomplete…' : 'Pick a suggestion to see the riding.'}
          </p>
        ) : null}

        {status === 'loading' && !result ? (
          <div className="try-embed__loading">
            <span className="try-embed__pulse" aria-hidden="true" />
            <p>Resolving riding…</p>
          </div>
        ) : null}

        {message && status !== 'ok' ? (
          <p className={`try-embed__status try-embed__status--${status}`}>{message}</p>
        ) : null}

        {result && heading ? (
          <div className="try-embed__card" key={heading + result.queryLabel}>
            <p className="try-embed__label">
              {status === 'loading' ? 'Updating…' : 'Federal electoral district'}
            </p>
            <p className="try-embed__riding">{heading}</p>
            <div className="try-embed__meta">
              {result.fedNum ? <span className="try-embed__chip">FED {result.fedNum}</span> : null}
              {result.municipality ? (
                <span className="try-embed__chip">{result.municipality}</span>
              ) : null}
              {result.provincial ? (
                <span className="try-embed__chip">Prov · {result.provincial}</span>
              ) : null}
            </div>
            {result.queryLabel ? <p className="try-embed__query">{result.queryLabel}</p> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
