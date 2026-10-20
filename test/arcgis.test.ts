import { describe, it, expect } from 'vitest';
import {
  arcgisFeaturesToGeoJSON,
  arcgisQueryUrl,
  fetchArcGisLayer,
  fetchArcGisPage,
  ArcGisServiceError,
  type ArcGisFeature,
} from '../src/arcgis';

const SERVICE = 'https://example.test/MapServer';

function feature(id: number): ArcGisFeature {
  return {
    attributes: { CSDUID: `35${id}` },
    geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('arcgisQueryUrl', () => {
  it('targets the layer query endpoint with the default parameters', () => {
    const url = new URL(arcgisQueryUrl({ serviceUrl: SERVICE, layerId: 9 }, 0));
    expect(url.pathname).toBe('/MapServer/9/query');
    expect(url.searchParams.get('where')).toBe('1=1');
    expect(url.searchParams.get('outFields')).toBe('*');
    expect(url.searchParams.get('outSR')).toBe('4326');
    expect(url.searchParams.get('f')).toBe('json');
    expect(url.searchParams.get('returnGeometry')).toBe('true');
    expect(url.searchParams.get('resultOffset')).toBe('0');
  });

  it('carries the offset, page size and field selection', () => {
    const url = new URL(
      arcgisQueryUrl(
        { serviceUrl: `${SERVICE}/`, layerId: 1 },
        2000,
        { where: 'FED_NUM=24001', outFields: 'FED_NUM,PD_NUM', pageSize: 500 }
      )
    );
    expect(url.pathname).toBe('/MapServer/1/query');
    expect(url.searchParams.get('where')).toBe('FED_NUM=24001');
    expect(url.searchParams.get('outFields')).toBe('FED_NUM,PD_NUM');
    expect(url.searchParams.get('resultRecordCount')).toBe('500');
    expect(url.searchParams.get('resultOffset')).toBe('2000');
  });
});

describe('fetchArcGisPage', () => {
  it('returns the features and the transfer-limit flag', async () => {
    const fetchImpl = async () =>
      jsonResponse({ features: [feature(1), feature(2)], exceededTransferLimit: true });
    const page = await fetchArcGisPage({ serviceUrl: SERVICE, layerId: 1 }, 0, { fetchImpl });
    expect(page.features).toHaveLength(2);
    expect(page.exceededTransferLimit).toBe(true);
  });

  it('raises a service error for a non-2xx response', async () => {
    const fetchImpl = async () => new Response('nope', { status: 500 });
    await expect(
      fetchArcGisPage({ serviceUrl: SERVICE, layerId: 1 }, 0, { fetchImpl })
    ).rejects.toBeInstanceOf(ArcGisServiceError);
  });

  it('raises a service error when a 200 body carries an error object', async () => {
    const fetchImpl = async () =>
      jsonResponse({ error: { code: 400, message: 'Invalid where clause' } });
    await expect(
      fetchArcGisPage({ serviceUrl: SERVICE, layerId: 1 }, 0, { fetchImpl })
    ).rejects.toThrow(/Invalid where clause/);
  });

  it('raises a service error when the body is not JSON', async () => {
    const fetchImpl = async () => new Response('<html>maintenance</html>', { status: 200 });
    await expect(
      fetchArcGisPage({ serviceUrl: SERVICE, layerId: 1 }, 0, { fetchImpl })
    ).rejects.toThrow(/not JSON/);
  });
});

describe('fetchArcGisLayer', () => {
  it('reads every page until the service says the last one', async () => {
    const offsets: number[] = [];
    const fetchImpl = async (_url: RequestInfo | URL) => {
      const url = new URL(String(_url));
      const offset = Number(url.searchParams.get('resultOffset'));
      offsets.push(offset);
      if (offset === 0) {
        return jsonResponse({
          features: [feature(1), feature(2)],
          exceededTransferLimit: true,
        });
      }
      return jsonResponse({ features: [feature(3)], exceededTransferLimit: false });
    };

    const features = await fetchArcGisLayer(
      { serviceUrl: SERVICE, layerId: 1 },
      { fetchImpl, pageSize: 2 }
    );

    expect(features).toHaveLength(3);
    expect(offsets).toEqual([0, 2]);
  });

  it('stops at the feature cap', async () => {
    const fetchImpl = async () =>
      jsonResponse({ features: [feature(1), feature(2)], exceededTransferLimit: true });
    const features = await fetchArcGisLayer(
      { serviceUrl: SERVICE, layerId: 1 },
      { fetchImpl, pageSize: 2, maxFeatures: 3 }
    );
    expect(features).toHaveLength(3);
  });

  it('retries a transient failure and then succeeds', async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      if (calls === 1) return new Response('boom', { status: 503 });
      return jsonResponse({ features: [feature(1)], exceededTransferLimit: false });
    };

    const features = await fetchArcGisLayer(
      { serviceUrl: SERVICE, layerId: 1 },
      { fetchImpl, pageSize: 2, retryBaseDelayMs: 1 }
    );

    expect(calls).toBe(2);
    expect(features).toHaveLength(1);
  });

  it('gives up after the retry budget', async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return new Response('boom', { status: 500 });
    };

    await expect(
      fetchArcGisLayer(
        { serviceUrl: SERVICE, layerId: 1 },
        { fetchImpl, pageSize: 2, retries: 2, retryBaseDelayMs: 1 }
      )
    ).rejects.toBeInstanceOf(ArcGisServiceError);

    expect(calls).toBe(3);
  });

  it('does not retry a non-transient failure', async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return new Response('nope', { status: 404 });
    };

    await expect(
      fetchArcGisLayer(
        { serviceUrl: SERVICE, layerId: 1 },
        { fetchImpl, pageSize: 2, retries: 3, retryBaseDelayMs: 1 }
      )
    ).rejects.toBeInstanceOf(ArcGisServiceError);

    expect(calls).toBe(1);
  });
});

describe('arcgisFeaturesToGeoJSON', () => {
  it('moves attributes onto properties and keeps the geometry', () => {
    const collection = arcgisFeaturesToGeoJSON([feature(1)]);
    expect(collection.type).toBe('FeatureCollection');
    expect(collection.features[0].properties).toEqual({ CSDUID: '351' });
    expect(collection.features[0].geometry.type).toBe('Polygon');
  });

  it('substitutes an empty geometry for a null one', () => {
    const collection = arcgisFeaturesToGeoJSON([{ attributes: {}, geometry: null }]);
    expect(collection.features[0].geometry).toEqual({ type: 'Polygon', coordinates: [] });
  });
});
