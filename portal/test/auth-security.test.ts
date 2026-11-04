import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getAuth } from '~/lib/auth.server';
import { createPortalDb, portalTestEnv, withPortalEnv, type PortalDb } from './helpers/portal-db';

const mail = vi.hoisted(() => ({ messages: [] as { html: string }[] }));
vi.mock('~/lib/email.server', async (importOriginal) => ({
  ...await importOriginal<typeof import('~/lib/email.server')>(),
  sendEmail: async (message: { html: string }) => { mail.messages.push(message); },
}));

const origin = 'http://localhost:5173';
const password = 'AuthSecurityFixture123!';
type AuthSession = { user: { id: string; email: string }; session: { id: string; expiresAt: string } };

describe('auth security with the portal configuration and migrated database', () => {
  let database: PortalDb;
  beforeEach(() => { database = createPortalDb(); mail.messages.length = 0; });
  afterEach(() => { vi.useRealTimers(); database.close(); });

  function request(path: string, body?: unknown, cookie?: string) {
    const usage = {
      idFromName: (name: string) => name,
      get: () => ({ fetch: async () => Response.json({ allowed: true }) }),
    };
    return withPortalEnv(portalTestEnv(database, { API_KEY_USAGE: usage as unknown as DurableObjectNamespace }), () =>
      getAuth().handler(new Request(`${origin}/api/auth/${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { Origin: origin, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })));
  }

  function cookies(response: Response) {
    return response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  }

  function applyCookies(jar: Map<string, string>, response: Response) {
    for (const value of response.headers.getSetCookie()) {
      const pair = value.split(';')[0];
      const separator = pair.indexOf('=');
      const name = pair.slice(0, separator);
      if (/;\s*max-age=0(?:;|$)/i.test(value)) jar.delete(name);
      else jar.set(name, pair.slice(separator + 1));
    }
    return [...jar].map(([name, value]) => `${name}=${value}`).join('; ');
  }

  async function signup(email: string) {
    const response = await request('sign-up/email', { email, password, name: 'Auth security fixture' });
    expect(response.status).toBe(200);
    return cookies(response);
  }

  async function verification(email: string, cookie: string) {
    expect((await request('send-verification-email', { email, callbackURL: '/account' }, cookie)).status).toBe(200);
    const href = mail.messages.at(-1)?.html.match(/href="([^"]+)"/)?.[1];
    expect(href).toBeTruthy();
    const link = new URL(href!.replaceAll('&amp;', '&'));
    expect(link.origin).toBe(origin);
    return `${link.pathname.replace('/api/auth/', '')}${link.search}`;
  }

  it('verifies the intended account and preserves its session across auth instances', async () => {
    const email = 'verification@example.test';
    const cookie = await signup(email);
    const link = await verification(email, cookie);
    expect((await request(link)).status).toBe(302);
    expect(database.sqlite.prepare('SELECT email_verified FROM user WHERE email = ?').get(email)?.email_verified).toBe(1);
    const session = await (await request('get-session', undefined, cookie)).json();
    expect(session).toMatchObject({ user: { email } });
  });

  it('does not transfer a fresh verification link to a replacement account at the same address', async () => {
    const email = 'recycled@example.test';
    const cookie = await signup(email);
    const link = await verification(email, cookie);
    // A local fixture models address reassignment; user-initiated change-email stays disabled.
    database.sqlite.prepare('UPDATE user SET email = ? WHERE email = ?').run('previous@example.test', email);
    await signup(email);
    const response = await request(link);
    expect(response.status).toBe(302);
    expect(new URL(response.headers.get('location')!, origin).searchParams.get('error')).toBe('INVALID_TOKEN');
    expect(database.sqlite.prepare('SELECT email_verified FROM user WHERE email = ?').get(email)?.email_verified).toBe(0);
    expect(cookies(response)).not.toContain('session_token=');
  });

  it('revokes a signed-out session in the backing store', async () => {
    const cookie = await signup('logout@example.test');
    expect(await (await request('get-session', undefined, cookie)).json()).toMatchObject({ user: { email: 'logout@example.test' } });
    expect((await request('sign-out', {}, cookie)).status).toBe(200);
    expect(await (await request('get-session', undefined, cookie)).json()).toBeNull();
  });

  it.each(['sign-in/email', 'sign-up/email'] as const)('refreshes a remembered %s after an earlier non-remembered sign-in in the same browser', async (endpoint) => {
    const email = 'remembered@example.test';
    await signup(email);
    const jar = new Map<string, string>();
    const temporary = await request('sign-in/email', { email, password, rememberMe: false });
    expect(temporary.status).toBe(200);
    let cookie = applyCookies(jar, temporary);
    expect(jar.has('better-auth.dont_remember')).toBe(true);

    const rememberedEmail = endpoint === 'sign-up/email' ? 'new-remembered@example.test' : email;
    const remembered = await request(endpoint, { email: rememberedEmail, password, name: 'Remembered fixture' }, cookie);
    expect(remembered.status).toBe(200);
    cookie = applyCookies(jar, remembered);
    const original = await (await request('get-session', undefined, cookie)).json() as AuthSession;
    expect(original).toMatchObject({ user: { email: rememberedEmail } });

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 24 * 60 * 60 * 1000 + 1000);
    const refreshed = await request('get-session', undefined, cookie);
    expect(refreshed.status).toBe(200);
    const session = await refreshed.json() as AuthSession;
    expect(session).toMatchObject({ user: { id: original.user.id, email: rememberedEmail }, session: { id: original.session.id } });
    expect(new Date(session.session.expiresAt).getTime()).toBeGreaterThan(new Date(original.session.expiresAt).getTime());
    expect(refreshed.headers.getSetCookie().find(value => value.startsWith('better-auth.session_token='))).toContain('Max-Age=');
    expect(jar.has('better-auth.dont_remember')).toBe(false);
  });

  it('preserves a non-remembered sign-in when a profile update reissues its cookie', async () => {
    const email = 'temporary@example.test';
    await signup(email);
    const jar = new Map<string, string>();
    const temporary = await request('sign-in/email', { email, password, rememberMe: false });
    expect(temporary.status).toBe(200);
    const cookie = applyCookies(jar, temporary);
    expect(jar.has('better-auth.dont_remember')).toBe(true);

    const updated = await request('update-user', { name: 'Updated fixture' }, cookie);
    expect(updated.status).toBe(200);
    const updatedCookie = applyCookies(jar, updated);
    expect(jar.has('better-auth.dont_remember')).toBe(true);
    const sessionCookie = updated.headers.getSetCookie().find(value => value.startsWith('better-auth.session_token='));
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie).not.toContain('Max-Age=');
    expect(await (await request('get-session', undefined, updatedCookie)).json()).toMatchObject({ user: { email, name: 'Updated fixture' } });
  });

  it('keeps user-initiated email changes disabled', async () => {
    const cookie = await signup('unchanged@example.test');
    const response = await request('change-email', { newEmail: 'other@example.test' }, cookie);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'CHANGE_EMAIL_DISABLED' });
  });
});
