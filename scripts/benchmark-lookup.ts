/**
 * Lightweight lookup benchmark for issue #8.
 * Run: npx tsx scripts/benchmark-lookup.ts
 */
import { createSpatialIndex, findCandidateFeatures } from '../src/spatial';
import type { GeoJSONFeature, GeoJSONFeatureCollection } from '../src/types';

function createPolygonFeature(coords: number[][][], properties: Record<string, unknown> = {}): GeoJSONFeature {
  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: coords },
    properties,
  };
}

function buildFixtureCollection(size: number): GeoJSONFeatureCollection {
  const features: GeoJSONFeature[] = [];
  const grid = Math.ceil(Math.sqrt(size));
  for (let i = 0; i < size; i++) {
    const row = Math.floor(i / grid);
    const col = i % grid;
    const x = col * 0.1;
    const y = row * 0.1;
    features.push(
      createPolygonFeature(
        [[[x, y], [x + 0.08, y], [x + 0.08, y + 0.08], [x, y + 0.08], [x, y]]],
        { id: i }
      )
    );
  }
  return { type: 'FeatureCollection', features };
}

function benchmark(label: string, iterations: number, fn: () => void): number {
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    fn();
  }
  const elapsed = performance.now() - start;
  const perOp = elapsed / iterations;
  console.log(`${label}: ${perOp.toFixed(3)}ms/op (${iterations} iterations, ${elapsed.toFixed(1)}ms total)`);
  return perOp;
}

const collection = buildFixtureCollection(500);
const index = createSpatialIndex(collection);
const points = [
  { name: 'Toronto', lon: -79.3832, lat: 43.6532 },
  { name: '757 Victoria Park fixture', lon: -79.3124, lat: 43.6891 },
  { name: 'Montreal', lon: -73.5673, lat: 45.5017 },
];

console.log('Riding lookup spatial index benchmark');
console.log(`Features indexed: ${collection.features.length}`);

for (const point of points) {
  benchmark(`candidate lookup @ ${point.name}`, 1000, () => {
    findCandidateFeatures(point.lon, point.lat, index);
  });
}
