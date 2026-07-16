import { describe, it, expect } from 'vitest';
import { createOpenAPISpec, createApiReference } from '../src/docs';
import { createLandingPage } from '../src/landing-page';
import { PROVINCIAL_DATASETS } from '../src/datasets';
import pkg from '../package.json';

/**
 * The OpenAPI spec and landing page are hand-maintained and were previously untested, which is
 * how three tags went missing, `securitySchemes` ended up outside `components`, and endpoints
 * reached production undocumented. These tests are cheap and catch that drift.
 */

const BASE = 'https://lookup.test';

interface Operation {
  summary?: string;
  tags?: string[];
  parameters?: Array<{ name: string; required?: boolean; in: string }>;
  responses?: Record<string, unknown>;
  security?: unknown[];
}
type PathItem = Record<string, Operation>;

function spec() {
  return createOpenAPISpec(BASE) as unknown as {
    openapi: string;
    paths: Record<string, PathItem>;
    components?: { securitySchemes?: Record<string, unknown> };
    securitySchemes?: Record<string, unknown>;
    tags: Array<{ name: string; description: string }>;
  };
}

function operations(): Array<{ path: string; method: string; op: Operation }> {
  const out: Array<{ path: string; method: string; op: Operation }> = [];
  for (const [path, item] of Object.entries(spec().paths)) {
    for (const [method, op] of Object.entries(item)) {
      out.push({ path, method, op });
    }
  }
  return out;
}

describe('OpenAPI document', () => {
  it('serialises to JSON, since it is served verbatim at /api/docs', () => {
    expect(() => JSON.stringify(createOpenAPISpec(BASE))).not.toThrow();
    expect(spec().openapi).toMatch(/^3\./);
  });

  it('declares securitySchemes under components, where OpenAPI 3.0 requires them', () => {
    // Regression: these sat as a sibling of `paths`, where they are silently ignored -- every
    // `security: [{ basicAuth: [] }]` referenced a scheme the document never defined.
    const s = spec();
    expect(s.components?.securitySchemes).toBeDefined();
    expect(s.components?.securitySchemes).toHaveProperty('basicAuth');
    expect(s.components?.securitySchemes).toHaveProperty('apiKey');
    expect(s.securitySchemes).toBeUndefined();
  });

  it('resolves every security requirement against a declared scheme', () => {
    const declared = Object.keys(spec().components?.securitySchemes ?? {});
    for (const { path, method, op } of operations()) {
      for (const requirement of op.security ?? []) {
        for (const name of Object.keys(requirement as Record<string, unknown>)) {
          expect(declared, `${method.toUpperCase()} ${path} requires undeclared scheme "${name}"`).toContain(name);
        }
      }
    }
  });

  it('declares exactly the tags its paths use', () => {
    const used = new Set(operations().flatMap(({ op }) => op.tags ?? []));
    const declared = new Set(spec().tags.map((t) => t.name));

    const undeclared = [...used].filter((t) => !declared.has(t));
    const unused = [...declared].filter((t) => !used.has(t));

    expect(undeclared, 'tags used by a path but not declared').toEqual([]);
    expect(unused, 'tags declared but used by no path').toEqual([]);
  });

  it('gives every operation a summary and at least one response', () => {
    for (const { path, method, op } of operations()) {
      expect(op.summary, `${method.toUpperCase()} ${path} has no summary`).toBeTruthy();
      expect(
        Object.keys(op.responses ?? {}).length,
        `${method.toUpperCase()} ${path} documents no responses`
      ).toBeGreaterThan(0);
    }
  });

  it('documents every provincial route', () => {
    const paths = Object.keys(spec().paths);
    for (const dataset of PROVINCIAL_DATASETS) {
      expect(paths, `${dataset.path} is undocumented`).toContain(dataset.path);
    }
  });
});

describe('GET /api/search is documented', () => {
  const searchOp = () => spec().paths['/api/search']?.get;

  it('appears in the OpenAPI spec', () => {
    expect(searchOp()).toBeDefined();
    expect(searchOp().tags).toContain('ODA Geolocation');
  });

  it('documents q as the one required parameter', () => {
    const params = searchOp().parameters ?? [];
    const byName = Object.fromEntries(params.map((p) => [p.name, p]));

    expect(byName.q?.required).toBe(true);
    for (const optional of ['province', 'limit', 'containerId', 'cursor', 'key', 'locationBias', 'locationRestriction']) {
      expect(byName[optional], `${optional} is undocumented`).toBeDefined();
      expect(byName[optional].required).toBeFalsy();
    }
  });

  it('documents the error codes the handler can actually return', () => {
    const responses = searchOp().responses ?? {};
    expect(Object.keys(responses)).toEqual(expect.arrayContaining(['200', '400', '401', '403', '429', '503']));
    expect(JSON.stringify(responses)).toContain('SUGGEST_INDEX_MISSING');
  });

  it('accepts either basic auth or a browser API key', () => {
    // The route itself takes EITHER: server-to-server callers use basic auth, the embed widget
    // presents a public pk_ key. Declaring only basicAuth told browser integrators they could not
    // call it at all.
    expect(searchOp().security).toEqual([{ basicAuth: [] }, { apiKey: [] }]);
  });

  it('tells integrators that riding is resolved separately', () => {
    // The single most important thing to convey: suggestions carry no riding.
    const description = String((searchOp() as { description?: string }).description);
    expect(description).toMatch(/riding/i);
    expect(description).toMatch(/\/api\/federal|\/api\/combined/);
  });

  it('is listed on the landing page', () => {
    expect(createLandingPage(BASE)).toContain('/api/search');
  });
});

describe('keyless demo tier', () => {
  const DEMO_PATHS = [
    '/api/demo/federal',
    '/api/demo/combined',
    '/api/demo/geocode',
    '/api/demo/reverse',
    '/api/demo/normalize-address',
  ];

  it('documents every demo mirror with no security requirement', () => {
    const s = spec();
    for (const path of DEMO_PATHS) {
      const op = s.paths[path]?.get;
      expect(op, `${path} is undocumented`).toBeDefined();
      // Keyless is the point of the tier: any security requirement here would be a lie.
      expect(op.security, `${path} must not require auth`).toBeUndefined();
      expect(op.tags).toContain('Demo');
      expect(Object.keys(op.responses ?? {}), `${path} must document the demo rate limit`).toContain('429');
    }
  });

  it('explains the per-IP rate limit and that demo calls are not billable', () => {
    const description = String(
      (spec().paths['/api/demo/federal'].get as { description?: string }).description
    );
    expect(description).toMatch(/rate.?limit/i);
    expect(description).toMatch(/not billable/i);
    expect(description).toContain('/api/demo');
  });

  it('takes the same lookup parameters as the mirrored route', () => {
    const s = spec();
    const real = (s.paths['/api/federal'].get.parameters ?? []).map((p) => p.name);
    const demo = (s.paths['/api/demo/federal'].get.parameters ?? []).map((p) => p.name);
    expect(demo).toEqual(real);
  });
});

describe('landing page', () => {
  it('lists every provincial route', () => {
    const html = createLandingPage(BASE);
    for (const dataset of PROVINCIAL_DATASETS) {
      expect(html, `${dataset.path} missing from landing page`).toContain(dataset.path);
    }
  });

  it('points the API reference at the spec endpoint', () => {
    expect(createApiReference(BASE)).toContain(`${BASE}/api/docs`);
  });

  it('loads the same Scalar version the devDependency pins', () => {
    // src/docs.ts hardcodes a CDN version that dependabot cannot see when it bumps package.json,
    // so the two drift silently. They were 1.59.3 vs ^1.62.1 before this test existed.
    const pinned = (pkg.devDependencies as Record<string, string>)['@scalar/api-reference'];
    const expected = pinned.replace(/^[\^~]/, '');
    expect(createApiReference(BASE)).toContain(`@scalar/api-reference@${expected}`);
  });
});
