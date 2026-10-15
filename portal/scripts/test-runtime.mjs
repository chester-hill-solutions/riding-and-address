import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';

// Exercise the built Worker with local bindings only. No migrations, remote data or external calls.
const origin = 'http://127.0.0.1:4179';
const child = spawn(process.execPath, [
  'node_modules/wrangler/bin/wrangler.js', 'dev', '--local', '--port', '4179',
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
  const api = await fetch(origin + '/api/geocode', { redirect: 'manual' });
  assert.ok([400, 401, 403].includes(api.status), `API ownership: ${api.status}`);
  assert.match(api.headers.get('content-type') ?? '', /application\/json/);
  console.log('Portal runtime smoke passed: pages, data requests, auth redirects and API ownership.');
} finally {
  child.kill('SIGTERM');
  await exited;
}
