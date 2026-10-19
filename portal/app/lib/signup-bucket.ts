/**
 * The bucket an address is counted under.
 *
 * **No raw address is persisted.** The address is signed with the deployment's auth secret, so
 * what the durable object holds is a keyed identifier: the bucket cannot be turned back into an
 * address without the secret, and the secret never leaves the Worker. A raw address in a bucket
 * name would make the signup counter a list of who signed up, and the counter is a rate limit —
 * it has no reason to know anything about who it is limiting.
 *
 * The secret is part of the key, so a rotated secret produces a different bucket for the same
 * address. That is the correct behaviour for a counter whose purpose is to stop one address from
 * signing up repeatedly: a rotation should not hand someone a fresh allowance by accident, and
 * the old allowance expires with the day it was counted on.
 */
export async function signupBucket(secret: string, address: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signed = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(address));
  return [...new Uint8Array(signed)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
