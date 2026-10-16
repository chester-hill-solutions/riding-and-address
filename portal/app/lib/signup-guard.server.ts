import { requireCloudflareEnv } from './cloudflare-context.server';
import { env } from './env.server';

/** Both signup routes use the same durable, keyed IP bucket. No raw IPs are persisted. */
export async function guardSignup(request: Request): Promise<Response | null> {
  const hostname = new URL(request.url).hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1') return null;
  const cf = requireCloudflareEnv(), ip = request.headers.get('CF-Connecting-IP');
  if (!ip || !cf.API_KEY_USAGE || !env().authSecret) return new Response('Signup temporarily unavailable', { status: 503 });
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env().authSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signed = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(ip));
  const bucket = [...new Uint8Array(signed)].map(b => b.toString(16).padStart(2, '0')).join('');
  try {
    const day = new Date().toISOString().slice(0, 10);
    const response = await cf.API_KEY_USAGE.get(cf.API_KEY_USAGE.idFromName(`signup:${bucket}`)).fetch(
      `https://usage/consume?day=${day}&limit=5`, { method: 'POST' });
    if (!response.ok) throw new Error('Unavailable');
    if (!(await response.json() as { allowed: boolean }).allowed) return new Response('Too many signup attempts. Try again tomorrow.', {
      status: 429, headers: { 'Retry-After': '86400' },
    });
    return null;
  } catch { return new Response('Signup temporarily unavailable', { status: 503 }); }
}
