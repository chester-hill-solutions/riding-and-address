/**
 * The session-liveness query, against the portal's real schema.
 *
 * `test/oauth-token.test.ts` proves the *policy* — a live session is accepted, a dead one is
 * refused, a database error fails closed, a typo in the switch cannot disable it. It does that
 * against a hand-written stub whose `prepare()` matches on the substring `FROM session`, which means
 * it would answer just as happily to a query against a column that does not exist.
 *
 * That is the gap this file closes. The session query is hand-written SQL against a table another
 * package owns, and it **fails closed**: a statement that throws is answered "this session is not
 * live", which refuses the token. A query with one wrong column name therefore does not degrade
 * the check — it refuses every access token in the deployment and takes the paid path down, with
 * nothing but a warning in a log to say so.
 *
 * So the same code path runs here against the portal's real migrations. If the column is renamed,
 * this test fails. If the expiry unit changes from milliseconds to seconds, this test fails.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';

import { clearJwksCache, clearSessionVerdictCache, verifyOAuthAccessToken } from '../src/oauth-token';
import { createPortalSchemaDb, type PortalSchemaDb } from './helpers/portal-schema';
import type { Env } from '../src/types';

const ORIGIN = 'https://lookup.test';
const ISSUER = `${ORIGIN}/api/auth`;
const AUDIENCE = `${ORIGIN}/mcp`;

const USER_ID = 'user_1';
const CUSTOMER_ID = 'cust_abc';

let privateKey: CryptoKey;
let jwk: Record<string, unknown>;
let portal: PortalSchemaDb;
let env: Env;

beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  privateKey = pair.privateKey;
  jwk = await exportJWK(pair.publicKey);
});

beforeEach(() => {
  clearJwksCache();
  clearSessionVerdictCache();

  portal = createPortalSchemaDb();
  // The user the session belongs to: `session.user_id` is a foreign key, and the real schema has
  // it, so the session cannot be inserted without the user.
  portal.sqlite
    .prepare('INSERT INTO user (id, name, email) VALUES (?, ?, ?)')
    .run(USER_ID, 'Test User', 'test@example.com');
  // The signing key, in the row shape the portal's `jwks` table holds it.
  portal.sqlite
    .prepare('INSERT INTO jwks (id, public_key, private_key, created_at, alg) VALUES (?, ?, ?, ?, ?)')
    .run('test', JSON.stringify(jwk), 'unused', Date.now(), 'RS256');

  env = { PORTAL_DB: portal.db } as unknown as Env;
});

afterEach(() => {
  portal.close();
});

/** Insert a session the way the portal stores one: an id, an expiry, and its owner. */
function insertSession(id: string, expiresAt: number): void {
  portal.sqlite
    .prepare('INSERT INTO session (id, expires_at, token, user_id) VALUES (?, ?, ?, ?)')
    .run(id, expiresAt, `token_${id}`, USER_ID);
}

/** An access token bound to a session, in the shape the provider mints it. */
function token(sid: string | null): Promise<string> {
  return new SignJWT({
    customer_id: CUSTOMER_ID,
    scope: 'ridings:lookup',
    ...(sid ? { sid } : {}),
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'test' })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setSubject(USER_ID)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);
}

describe('the session-liveness query, against the portal\'s real schema', () => {
  it('accepts a token whose session is live', async () => {
    insertSession('session_1', Date.now() + 60 * 60 * 1000);

    const result = await verifyOAuthAccessToken(env, await token('session_1'), ORIGIN);

    expect(result.ok).toBe(true);
  });

  it('refuses a token whose session row is gone — a sign-out', async () => {
    insertSession('session_1', Date.now() + 60 * 60 * 1000);
    portal.sqlite.prepare('DELETE FROM session WHERE id = ?').run('session_1');

    const result = await verifyOAuthAccessToken(env, await token('session_1'), ORIGIN);

    expect(result).toEqual({ ok: false, reason: 'session_ended' });
  });

  it('refuses a token whose session has expired', async () => {
    insertSession('session_1', Date.now() - 1000);

    const result = await verifyOAuthAccessToken(env, await token('session_1'), ORIGIN);

    expect(result).toEqual({ ok: false, reason: 'session_ended' });
  });

  it('reads the expiry as milliseconds, the unit the portal stores it in', async () => {
    // The same instant, written in seconds. Read as milliseconds it is 1970, which is expired; read
    // as seconds it is live. The portal stores `expires_at` as a millisecond timestamp, so a
    // session written this way is not a live session — and a query that read the column as seconds
    // would call it one.
    insertSession('session_1', Math.floor(Date.now() / 1000) + 60 * 60);

    const result = await verifyOAuthAccessToken(env, await token('session_1'), ORIGIN);

    expect(result).toEqual({ ok: false, reason: 'session_ended' });
  });

  it('refuses a token whose session id matches nothing at all', async () => {
    const result = await verifyOAuthAccessToken(env, await token('session_that_never_existed'), ORIGIN);

    expect(result).toEqual({ ok: false, reason: 'session_ended' });
  });
});
