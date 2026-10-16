import { describe, it, expect } from 'vitest';
import {
  AREA_MAX_SPAN_DEGREES,
  AREA_MAX_VERTICES,
  validateAreaGeometry,
} from '../src/area-geometry';

/**
 * A caller-supplied shape is refused *before* anything expensive happens. These pin the refusals,
 * because a malformed ring or an oversized shape that slips through becomes an unbounded scan.
 */

const SQUARE = {
  type: 'Polygon',
  coordinates: [
    [
      [-75.8, 45.3],
      [-75.5, 45.3],
      [-75.5, 45.5],
      [-75.8, 45.5],
      [-75.8, 45.3],
    ],
  ],
};

describe('validateAreaGeometry', () => {
  it('accepts a well-formed Polygon', () => {
    const result = validateAreaGeometry(SQUARE);
    expect(result.ok).toBe(true);
  });

  it('accepts a MultiPolygon', () => {
    const result = validateAreaGeometry({
      type: 'MultiPolygon',
      coordinates: [SQUARE.coordinates, SQUARE.coordinates],
    });
    expect(result.ok).toBe(true);
  });

  it('rejects anything that is not a Polygon or MultiPolygon', () => {
    expect(validateAreaGeometry({ type: 'Point', coordinates: [0, 0] }).ok).toBe(false);
    expect(validateAreaGeometry(null).ok).toBe(false);
    expect(validateAreaGeometry('POLYGON((0 0))').ok).toBe(false);
    expect(validateAreaGeometry({ type: 'Polygon' }).ok).toBe(false);
  });

  it('rejects a ring that is not closed', () => {
    const result = validateAreaGeometry({
      type: 'Polygon',
      coordinates: [
        [
          [-75.8, 45.3],
          [-75.5, 45.3],
          [-75.5, 45.5],
          [-75.7, 45.5],
        ],
      ],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/not closed/);
  });

  it('rejects a ring with too few positions', () => {
    const result = validateAreaGeometry({
      type: 'Polygon',
      coordinates: [
        [
          [-75.8, 45.3],
          [-75.5, 45.5],
          [-75.8, 45.3],
        ],
      ],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/at least 4 positions/);
  });

  it('rejects a coordinate outside WGS84 range', () => {
    const result = validateAreaGeometry({
      type: 'Polygon',
      coordinates: [
        [
          [-200, 45.3],
          [-75.5, 45.3],
          [-75.5, 45.5],
          [-200, 45.3],
        ],
      ],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/WGS84/);
  });

  it('rejects a malformed position', () => {
    const result = validateAreaGeometry({
      type: 'Polygon',
      coordinates: [[[-75.8, 45.3], [-75.5, 'north'], [-75.5, 45.5], [-75.8, 45.3]]],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/malformed position/);
  });

  it('rejects a shape with too many vertices', () => {
    // A closed ring of AREA_MAX_VERTICES + 1 distinct positions (plus the repeated first).
    const ring: number[][] = [];
    const count = AREA_MAX_VERTICES + 1;
    for (let i = 0; i < count; i += 1) {
      ring.push([-75.8 + (i % 10) * 0.001, 45.3 + Math.floor(i / 10) * 0.001]);
    }
    ring.push([...ring[0]]);
    const result = validateAreaGeometry({ type: 'Polygon', coordinates: [ring] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/over the/);
  });

  it('rejects a shape that spans too much of the country', () => {
    const span = AREA_MAX_SPAN_DEGREES + 1;
    const result = validateAreaGeometry({
      type: 'Polygon',
      coordinates: [
        [
          [-75, 45],
          [-75 + span, 45],
          [-75 + span, 45 + span],
          [-75, 45 + span],
          [-75, 45],
        ],
      ],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/spans/);
  });
});
