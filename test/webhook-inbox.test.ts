import { describe, it, expect, vi } from 'vitest';
import { createLookupTestEnv, fetchLookup } from './helpers/lookup-test-env';
import type { Env } from '../src/types';

interface SentMessage {
  to: string;
  from: string;
  subject: string;
  text: string;
}

function envWithInbox(token: string) {
  const send = vi.fn(async (_message: SentMessage) => ({ messageId: 'msg-1' }));
  const env = createLookupTestEnv();
  env.INBOX_TOKEN = token;
  env.INBOX_TO = 'narfin@chsolutions.ca';
  env.INBOX_FROM = 'alerts@email.chesterhillsolutions.ca';
  env.SEND_EMAIL = { send } as unknown as Env['SEND_EMAIL'];
  return { env, send };
}

describe('webhook inbox', () => {
  it('emails the full request (headers, query and body) when the token matches', async () => {
    const { env, send } = envWithInbox('secret-token');
    const res = await fetchLookup(env, '/hooks/inbox/secret-token?source=test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"event":"hello"}',
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok?: boolean; bytes?: number };
    expect(body.ok).toBe(true);
    expect(body.bytes).toBe(17);
    expect(send).toHaveBeenCalledTimes(1);

    const message = send.mock.calls[0][0];
    expect(message.to).toBe('narfin@chsolutions.ca');
    expect(message.from).toBe('alerts@email.chesterhillsolutions.ca');
    expect(message.subject).toContain('POST');
    expect(message.text).toContain('{"event":"hello"}');
    expect(message.text).toContain('source=test');
  });

  it('catches any method, including a bodyless GET', async () => {
    const { env, send } = envWithInbox('secret-token');
    const res = await fetchLookup(env, '/hooks/inbox/secret-token', { method: 'GET' });
    expect(res.status).toBe(200);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('rejects a wrong token with 404 and does not send', async () => {
    const { env, send } = envWithInbox('secret-token');
    const res = await fetchLookup(env, '/hooks/inbox/not-the-token', { method: 'POST', body: 'x' });
    expect(res.status).toBe(404);
    expect(send).not.toHaveBeenCalled();
  });

  it('returns 503 when the token or binding is not configured', async () => {
    const env = createLookupTestEnv();
    const res = await fetchLookup(env, '/hooks/inbox/anything', { method: 'POST', body: 'x' });
    expect(res.status).toBe(503);
  });
});
