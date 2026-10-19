import { describe, expect, it } from 'vitest';

import { createLookupTestEnv, fetchLookup } from './helpers/lookup-test-env';
import type { Env } from '../src/types';

/**
 * What a wrong method gets, and what it does not get.
 *
 * **This is the behaviour the port nearly lost.** The Worker's legacy chain matched some branches
 * on the path alone and checked the method inside — so a wrong method was a **405** — and matched
 * others on the path *and* the method — so a wrong method fell through to the surface's own
 * **404**. Moving the routes into the route table made them uniform, and uniform is not the same
 * as correct: six routes silently turned their 405 into a 404, which tells an operator debugging a
 * failure that their path is wrong when their verb is.
 *
 * So the distinction is now stated, and the table carries it:
 *
 * - A route whose legacy branch checked the method **inside** claims its path for every method and
 *   answers 405. The table says "this path exists"; the handler says "not with this verb".
 * - A route whose legacy branch matched the method **in the condition** declares one method, so a
 *   wrong method does not match the entry and the surface's catch-all answers 404.
 *
 * The auth gate runs first for both, so an unauthenticated caller gets 401 rather than learning
 * which verbs a path supports. That ordering is deliberate: the legacy chain reached the 405 before
 * any auth gate, because a wrong-method request happened to match the permissive catch-all entry.
 * Answering an unauthenticated caller with a 405 tells them the shape of an operator endpoint they
 * have no business knowing.
 */

const OPERATOR = `Basic ${btoa('admin:secret')}`;

function operatorEnv(): Env {
  const env = createLookupTestEnv() as Env;
  env.BASIC_AUTH = 'admin:secret';
  return env;
}

/** The routes whose legacy branch checked the method inside the branch. */
const ANSWERS_405: Array<[string, string]> = [
  ['/api/queue/status', 'POST'],
  ['/api/queue/submit', 'GET'],
  ['/api/queue/process', 'GET'],
  ['/api/queue/stats', 'POST'],
  ['/api/geocoding/batch/status', 'POST'],
  ['/api/cache/warm', 'GET'],
];

/** The routes whose legacy branch matched the method in the condition. */
const ANSWERS_404: Array<[string, string]> = [
  ['/api/database/init', 'GET'],
  ['/api/database/sync', 'GET'],
  ['/api/database/stats', 'POST'],
  ['/api/database/query', 'POST'],
  ['/api/boundaries/lookup', 'POST'],
  ['/api/boundaries/all', 'POST'],
  ['/api/boundaries/config', 'POST'],
  ['/batch', 'GET'],
  ['/batch/abc', 'POST'],
  ['/queue/process', 'GET'],
];

describe('a wrong method', () => {
  for (const [path, method] of ANSWERS_405) {
    it(`answers 405 for ${method} ${path}`, async () => {
      const response = await fetchLookup(operatorEnv(), path, {
        method,
        headers: { Authorization: OPERATOR },
        body: method === 'POST' ? '{}' : undefined,
      });
      expect(response.status).toBe(405);
    });
  }

  for (const [path, method] of ANSWERS_404) {
    it(`answers 404 for ${method} ${path}`, async () => {
      const response = await fetchLookup(operatorEnv(), path, {
        method,
        headers: { Authorization: OPERATOR },
        body: method === 'POST' ? '{}' : undefined,
      });
      expect(response.status).toBe(404);
    });
  }

  it('answers 401 before either, for a caller with no credential', async () => {
    // Auth first: an unauthenticated caller does not learn which verbs a path supports, and does
    // not learn that the path exists at all.
    const response = await fetchLookup(createLookupTestEnv(), '/api/queue/status', { method: 'POST' });
    expect(response.status).toBe(401);
  });

  it('answers 404 for a path that does not exist at all', async () => {
    const response = await fetchLookup(operatorEnv(), '/api/queue/nope', {
      headers: { Authorization: OPERATOR },
    });
    expect(response.status).toBe(404);
  });
});
