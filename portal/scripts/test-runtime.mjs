import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hashOpaqueToken } from '@chester-hill-solutions/auth';

// Exercise the built Worker with a temporary local database and local KV. No remote data or email.
const origin = 'http://127.0.0.1:4179';
const config = 'build/server/wrangler.json';
const state = await mkdtemp(join(tmpdir(), 'cancoder-runtime-'));
function localSql(command) {
  const result = spawnSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'd1', 'execute', 'PORTAL_DB',
    '--config', config, '--local', '--persist-to', state, '--command', command, '--json'],
  { encoding: 'utf8', env: { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false' } });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return JSON.parse(result.stdout).flatMap(batch => batch.results ?? []);
}
const migration = spawnSync(process.execPath, [
  'node_modules/wrangler/bin/wrangler.js', 'd1', 'migrations', 'apply', 'PORTAL_DB',
  '--config', config, '--local', '--persist-to', state,
], { encoding: 'utf8', env: { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false' } });
if (migration.status !== 0) {
  await rm(state, { recursive: true, force: true });
  throw new Error(`Local database setup failed: ${migration.stdout} ${migration.stderr}`);
}
const child = spawn(process.execPath, [
  'node_modules/wrangler/bin/wrangler.js', 'dev', '--config', config, '--local', '--persist-to', state, '--port', '4179',
  '--var', 'AUTH_SECRET:local-runtime-test-only-0123456789abcdef',
  '--var', `BASE_URL:${origin}`,
  '--var', `AUTH_TRUSTED_ORIGINS:${origin}`,
  '--var', 'STRIPE_SECRET_KEY:sk_test_local_runtime_only',
  '--var', 'STRIPE_WEBHOOK_SECRET:whsec_local_runtime_only',
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
  const uploadOrigin = await fetch(origin + '/app/uploads', { headers: { Cookie: cookie } });
  assert.match(await uploadOrigin.text(), /Verify your email first/);
  const unverified = new FormData();
  unverified.set('sheet', new File(['latitude,longitude,name\n0,0,Test'], 'test.csv', { type: 'text/csv' }));
  const blockedUpload = await fetch(origin + '/app/uploads', {
    method: 'POST', headers: { Origin: origin, Cookie: cookie }, body: unverified,
  });
  assert.equal(blockedUpload.status, 200, 'same-origin unverified upload reaches the account guard');
  assert.match(await blockedUpload.text(), /Verify your email before/);
  // Only this disposable LOCAL fixture is marked verified; no test email is sent.
  const verified = spawnSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'd1', 'execute', 'PORTAL_DB',
    '--config', config, '--local', '--persist-to', state,
    '--command', `UPDATE user SET email_verified = 1 WHERE email = 'runtime@example.test'`,
  ], { encoding: 'utf8', env: { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false' } });
  assert.equal(verified.status, 0, verified.stderr);
  const sheet = new FormData();
  sheet.set('sheet', new File(['latitude,longitude,name\n0,0,Test\n,,Invalid'], 'test.csv', { type: 'text/csv' }));
  const prepared = await fetch(origin + '/app/uploads', {
    method: 'POST', redirect: 'manual', headers: { Origin: origin, Cookie: cookie }, body: sheet,
  });
  assert.equal(prepared.status, 302, await prepared.clone().text());
  const jobPath = prepared.headers.get('location');
  assert.match(jobPath, /^\/app\/uploads\/[a-f0-9-]+$/);
  const quote = await fetch(origin + jobPath, { headers: { Cookie: cookie } });
  assert.equal(quote.status, 200);
  assert.match(await quote.text(), /Your upload quote/);
  const csrf = await fetch(origin + jobPath, { method: 'POST', headers: { Origin: 'https://other.example', Cookie: cookie }, body: new URLSearchParams({ intent: 'start' }) });
  assert.ok([400, 403].includes(csrf.status), 'cross-origin upload mutation is rejected by the router or action');
  let started;
  for (let attempt = 0; attempt < 3; attempt++) {
    started = await fetch(origin + jobPath, {
      method: 'POST', redirect: 'manual', headers: { Origin: origin, Cookie: cookie }, body: new URLSearchParams({ intent: 'start' }),
    });
    if (started.status !== 503 || !(await started.clone().text()).includes('Your worker restarted mid-request')) break;
    // Wrangler may reload after the local D1 fixture update. This free-upload action is
    // idempotent; retry only the dev proxy's explicit abort, never an application failure.
    const ready = await fetch(origin);
    assert.equal(ready.status, 200, 'local Worker ready after its development reload');
  }
  assert.equal(started.status, 302, await started.clone().text());
  const completedDeadline = Date.now() + 20000;
  while (true) {
    const result = await fetch(origin + jobPath, { headers: { Cookie: cookie } });
    const html = await result.text();
    if (html.includes('Your results are ready')) break;
    if (Date.now() > completedDeadline) throw new Error('Local upload did not complete: ' + output);
    await delay(250);
  }
  const download = await fetch(origin + jobPath + '/results.csv', { headers: { Cookie: cookie } });
  assert.equal(download.status, 200);
  assert.match(download.headers.get('content-type'), /text\/csv/);
  assert.match(await download.text(), /cancoder_status/);
  const otherSignup = await fetch(origin + '/signup', {
    method: 'POST', redirect: 'manual', headers: { Origin: origin },
    body: new URLSearchParams({ email: 'other-runtime@example.test', password: 'LocalRuntimeTest123!', name: 'Other Test' }),
  });
  assert.equal(otherSignup.status, 302);
  const otherCookie = otherSignup.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  const otherJob = await fetch(origin + jobPath, { headers: { Cookie: otherCookie } });
  assert.equal(otherJob.status, 404, 'another workspace cannot read the upload');
  const invalidInvite = await fetch(origin + '/app/invites.data', {
    method: 'POST', headers: { Origin: origin, Cookie: cookie },
    body: new URLSearchParams({ email: 'not-an-email' }),
  });
  assert.equal(invalidInvite.status, 200);
  assert.match(await invalidInvite.text(), /valid email address/);
  const ownerInvite = await fetch(origin + '/app/invites', {
    method: 'POST', headers: { Origin: origin, Cookie: cookie },
    body: new URLSearchParams({ email: 'invited-runtime@example.test' }),
  });
  assert.equal(ownerInvite.status, 200);
  assert.match(await ownerInvite.text(), /Invite sent to/, 'the actual owner route creates an invitation');
  const [createdInvite] = localSql(`SELECT i.workspace_id, i.role_id, i.status FROM workspace_invitation i
    JOIN workspace_member m ON m.workspace_id=i.workspace_id AND m.user_id=i.invited_by_user_id
    JOIN user u ON u.id=m.user_id WHERE u.email='runtime@example.test' AND i.email='invited-runtime@example.test'`);
  assert.equal(createdInvite.role_id, 'member');
  assert.equal(createdInvite.status, 'pending');
  // Replace only this local fixture's token because email delivery is disabled.
  const inviteToken = 'chs-invitation-local-runtime-only-credential';
  localSql(`UPDATE workspace_invitation SET token_hash='${hashOpaqueToken(inviteToken)}'
    WHERE email='invited-runtime@example.test' AND status='pending'`);
  const invitedSignup = await fetch(origin + '/signup?invite=' + inviteToken, {
    method: 'POST', redirect: 'manual', headers: { Origin: origin },
    body: new URLSearchParams({ email: 'invited-runtime@example.test', password: 'LocalRuntimeTest123!',
      name: 'Invited member', inviteToken, workspaceId: 'forged-customer' }),
  });
  assert.equal(invitedSignup.status, 302, await invitedSignup.clone().text());
  const memberships = localSql(`SELECT m.workspace_id,m.role_id FROM workspace_member m
    JOIN user u ON u.id=m.user_id WHERE u.email='invited-runtime@example.test'`);
  assert.deepEqual(memberships, [{ workspace_id: createdInvite.workspace_id, role_id: 'member' }],
    'redemption grants only the stored Customer and member role, never the submitted workspace');
  const invitedCookie = invitedSignup.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  const memberInvite = await fetch(origin + '/app/invites', {
    method: 'POST', headers: { Origin: origin, Cookie: invitedCookie },
    body: new URLSearchParams({ email: 'forbidden-runtime@example.test' }),
  });
  assert.match(await memberInvite.text(), /Only owners\/admins can invite/);
  assert.equal(localSql("SELECT count(*) AS count FROM workspace_invitation WHERE email='forbidden-runtime@example.test'")[0].count, 0);
  localSql("UPDATE workspace_member SET role_id='admin' WHERE user_id=(SELECT id FROM user WHERE email='invited-runtime@example.test')");
  const adminInvite = await fetch(origin + '/app/invites', {
    method: 'POST', headers: { Origin: origin, Cookie: invitedCookie },
    body: new URLSearchParams({ email: 'admin-target-runtime@example.test' }),
  });
  assert.match(await adminInvite.text(), /Invite sent to/, 'existing admins may still invite members');
  assert.deepEqual(localSql("SELECT workspace_id,role_id FROM workspace_invitation WHERE email='admin-target-runtime@example.test'"),
    [{ workspace_id: createdInvite.workspace_id, role_id: 'member' }]);
  const forgedWrite = await fetch(origin + '/api/auth/update-user', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://attacker.example', Cookie: cookie },
    body: JSON.stringify({ name: 'Forged account change' }),
  });
  assert.equal(forgedWrite.status, 403, 'the actual auth endpoint refuses an untrusted cookie-bearing write');
  assert.equal(localSql("SELECT name FROM user WHERE email='runtime@example.test'")[0].name, 'Runtime Test');
  const replay = await fetch(origin + '/signup?invite=' + inviteToken, {
    method: 'POST', headers: { Origin: origin },
    body: new URLSearchParams({ email: 'invited-runtime@example.test', password: 'LocalRuntimeTest123!', name: 'Replay', inviteToken }),
  });
  assert.match(await replay.text(), /no longer active/);
  const forgedToken = await fetch(origin + '/signup', {
    method: 'POST', headers: { Origin: origin },
    body: new URLSearchParams({ email: 'forged-runtime@example.test', password: 'LocalRuntimeTest123!',
      name: 'Forged token', inviteToken: 'not-a-real-invitation' }),
  });
  assert.match(await forgedToken.text(), /not valid/);
  assert.equal(localSql("SELECT count(*) AS count FROM user WHERE email='forged-runtime@example.test'")[0].count, 0);
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
  // Sign with Node, verify in the built Worker: catches sync-only crypto regressions.
  // An unhandled event exercises verification without activating a customer or calling Stripe.
  const payload = JSON.stringify({ id: 'evt_runtime_signature', object: 'event',
    type: 'cancoder.runtime.signature', livemode: false, data: { object: {} } });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac('sha256', 'whsec_local_runtime_only')
    .update(`${timestamp}.${payload}`).digest('hex');
  const webhook = async (body, header) => {
    let response;
    for (let attempt = 0; attempt < 3; attempt++) {
      response = await fetch(origin + '/api/stripe/webhook', {
        method: 'POST', headers: { 'Content-Type': 'application/json',
          ...(header ? { 'Stripe-Signature': header } : {}) }, body,
      });
      if (response.status !== 503 || !(await response.clone().text()).includes('Your worker restarted mid-request')) break;
      // These invalid-signature / unsupported-event fixtures have no side effects.
      // Retry only Wrangler's explicit development reload, never a webhook error.
      const ready = await fetch(origin);
      assert.equal(ready.status, 200, 'local Worker ready after webhook test development reload');
    }
    return response;
  };
  const header = `t=${timestamp},v1=${signature}`;
  assert.equal((await webhook(payload)).status, 400, 'missing webhook signature');
  assert.equal((await webhook(payload + ' ', header)).status, 400, 'tampered webhook body');
  const signed = await webhook(payload, header);
  assert.equal(signed.status, 200, 'valid signature accepted by the Worker crypto provider');
  assert.deepEqual(await signed.json(), { ok: true });
  console.log('Portal runtime smoke passed: pages, data requests, signup, sessions, login redirects, invite validation, API ownership, Stripe webhook signatures, verified uploads, private results and cross-origin payment protection.');
} finally {
  child.kill('SIGTERM');
  await exited;
  await rm(state, { recursive: true, force: true });
}
