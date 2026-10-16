import { freeEmailIdentity } from '../../../src/free-access-policy';
import { eq } from 'drizzle-orm';
import { user } from '~/db/schema';
import { getDb } from './db.server';
import { requireCloudflareEnv } from './cloudflare-context.server';
import type { UploadJob } from '../../../src/upload-sheet';

export class UploadServiceError extends Error { constructor(message: string, public status: number) { super(message); } }

export function uploadStub(customerId: string) {
  const binding = requireCloudflareEnv().API_KEY_USAGE;
  if (!binding) throw new Error('Upload storage is unavailable');
  return binding.get(binding.idFromName(`customer:${customerId}`));
}
export async function uploadCall<T>(customerId: string, operation: string, id = '', body?: unknown): Promise<T> {
  const response = await uploadStub(customerId).fetch(`https://usage/uploads/${operation}?id=${encodeURIComponent(id)}`,
    body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok) {
    const result = await response.json() as { error?: string };
    throw new UploadServiceError(result.error || 'Upload unavailable', response.status);
  }
  return response.json() as Promise<T>;
}
export async function uploadIdentity(userId: string) {
  const account = (await getDb().select({ email: user.email, verified: user.emailVerified }).from(user).where(eq(user.id, userId)).limit(1))[0];
  return account ?? { email: '', verified: false };
}

export async function claimFreeAllowance(userId: string, customerId: string): Promise<boolean> {
  const identity = await uploadIdentity(userId);
  if (!identity.verified) throw new Error('Verify your email before using free rows or creating API keys.');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(freeEmailIdentity(identity.email)));
  const hash = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
  const binding = requireCloudflareEnv().API_KEY_USAGE;
  if (!binding) throw new Error('Allowance verification is unavailable');
  const response = await binding.get(binding.idFromName(`free-identity:${hash}`)).fetch('https://usage/claim-free', {
    method: 'POST', body: JSON.stringify({ customerId }), headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) throw new Error('Allowance verification is unavailable');
  return (await response.json() as { allowed: boolean }).allowed;
}
export type UploadList = { jobs: UploadJob[]; credits: number };
