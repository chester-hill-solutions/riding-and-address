import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Exercise the built Worker with a temporary local database and local KV. No remote data or email.
const origin = 'http://127.0.0.1:4179';
const state = await mkdtemp(join(tmpdir(), 'cancoder-runtime-'));
const migration = spawnSync(process.execPath, [
  'node_modules/wrangler/bin/wrangler.js', 'd1', 'migrations', 'apply', 'PORTAL_DB',
  '--local', '--persist-to', state,
], { encoding: 'utf8', env: { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false' } });
if (migration.status !== 0) {
  await rm(state, { recursive: true, force: true });
  throw new Error(`Local database setup failed: ${migration.stdout} ${migration.stderr}`);
}
const child = spawn(process.execPath, [
  'node_modules/wrangler/bin/wrangler.js', 'dev', '--local', '--persist-to', state, '--port', '4179',
  '--var', 'AUTH_SECRET:local-runtime-test-only-0123456789abcdef',
  '--var', `BASE_URL:${origin}`,
], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false' } });
let output = '';
for (const stream of [child.stdout, child.stderr]) {
  stream.on('data', (chunk) => { output = (output + chunk).slice(-8000); });
}
const exited = once(child, 'exit');
try {
  const deadline = Date.now() + 30000;
  while (true) {
    if (child.exitCode !== null) throw new Error(`Worker exited: ${output}`);
    try {
      const ready = await fetch(origin, { signal: AbortSignal.timeout(1000) });
      if (ready.status === 200) break;
    } catch { /* startup */ }
    if (Date.now() >= deadline) throw new Error(`Worker did not start: ${output}`);
    await delay(200);
  }
  for (const path of ['/', '/login', '/signup']) {
    const response = await fetch(origin + path);
    assert.equal(response.status, 200, path);
    assert.match(await response.text(), /CanCoder/, path);
  }
  for (const path of ['/_.data', '/login.data', '/signup/_.data']) {
    const response = await fetch(origin + path, { redirect: 'manual' });
    assert.equal(response.status, 200, path);
    assert.doesNotMatch(await response.text(), /Unexpected Server Error/, path);
  }
  for (const path of ['/app', '/app/keys']) {
    const response = await fetch(origin + path, { redirect: 'manual' });
    assert.equal(response.status, 302, path);
    assert.equal(response.headers.get('location'), `/login?continue=${encodeURIComponent(path)}`);
    const data = await fetch(`${origin}${path}.data`, { redirect: 'manual' });
    assert.equal(data.status, 202, `${path}.data redirect`);
    const body = await data.text();
    assert.ok(body.includes(`/login?continue=${encodeURIComponent(path)}`), body);
    assert.ok(!body.includes(encodeURIComponent(`${path}.data`)), body);
  }
  const invalidLogin = await fetch(origin + '/login.data', {
    method: 'POST', headers: { Origin: origin },
    body: new URLSearchParams({ email: 'not-an-email', password: 'invalid' }),
  });
  assert.equal(invalidLogin.status, 200, 'invalid login action returns feedback');
  assert.match(await invalidLogin.text(), /Invalid email or password|Sign-in failed/);
  const signup = await fetch(origin + '/signup', {
    method: 'POST', redirect: 'manual', headers: { Origin: origin },
    body: new URLSearchParams({ email: 'runtime@example.test', password: 'LocalRuntimeTest123!', name: 'Runtime Test' }),
  });
  assert.equal(signup.status, 302, await signup.clone().text());
  const cookie = signup.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
  assert.ok(cookie, 'signup forwards session cookies');
  const account = await fetch(origin + '/app', { redirect: 'manual', headers: { Cookie: cookie } });
  assert.equal(account.status, 200, 'session survives redirect into the authenticated portal');
  const invalidInvite = await fetch(origin + '/app/invites.data', {
    method: 'POST', headers: { Origin: origin, Cookie: cookie },
    body: new URLSearchParams({ email: 'not-an-email' }),
  });
  assert.equal(invalidInvite.status, 200);
  assert.match(await invalidInvite.text(), /valid email address/);
  const login = await fetch(origin + '/login?continue=%2Fapp%2Fkeys', {
    method: 'POST', redirect: 'manual', headers: { Origin: origin },
    body: new URLSearchParams({ email: 'runtime@example.test', password: 'LocalRuntimeTest123!' }),
  });
  assert.equal(login.status, 302, await login.clone().text());
  assert.equal(login.headers.get('location'), '/app/keys');
  assert.ok(login.headers.getSetCookie().length, 'login forwards session cookies');
  const api = await fetch(origin + '/api/geocode', { redirect: 'manual' });
  assert.ok([400, 401, 403].includes(api.status), `API ownership: ${api.status}`);
  assert.match(api.headers.get('content-type') ?? '', /application\/json/);
  console.log('Portal runtime smoke passed: pages, data requests, signup, sessions, login redirects, invite validation and API ownership.');
} finally {
  child.kill('SIGTERM');
  await exited;
  await rm(state, { recursive: true, force: true });
}
