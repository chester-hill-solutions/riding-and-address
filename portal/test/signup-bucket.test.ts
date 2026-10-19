import { describe, expect, it } from 'vitest';

import { signupBucket } from '~/lib/signup-bucket';

/**
 * The signup bucket, and the claim it carries.
 *
 * The comment on `signupBucket` says "no raw address is persisted". That is a claim about what
 * ends up in the durable object, and the object outlives the request, so it is worth a test that
 * reads the value rather than the comment. If someone replaces the keyed identifier with the
 * address itself — which would be simpler and would work — this test is what notices.
 */
describe('the signup bucket', () => {
  const secret = 'a-deployment-secret-for-the-test-only';

  it('does not contain the address it was made from', async () => {
    const address = '203.0.113.45';
    const bucket = await signupBucket(secret, address);
    expect(bucket).not.toContain(address);
    expect(bucket).not.toContain('203.0.113');
  });

  it('is the same for the same address and secret', async () => {
    const first = await signupBucket(secret, '203.0.113.45');
    const second = await signupBucket(secret, '203.0.113.45');
    expect(first).toBe(second);
  });

  it('differs for different addresses', async () => {
    const first = await signupBucket(secret, '203.0.113.45');
    const second = await signupBucket(secret, '203.0.113.46');
    expect(first).not.toBe(second);
  });

  it('differs for a different secret, so a rotated secret is a different bucket', async () => {
    const first = await signupBucket(secret, '203.0.113.45');
    const second = await signupBucket('another-secret-for-the-test-only', '203.0.113.45');
    expect(first).not.toBe(second);
  });

  it('is hex, because it is a bucket name and a key', async () => {
    const bucket = await signupBucket(secret, '203.0.113.45');
    expect(bucket).toMatch(/^[0-9a-f]{64}$/);
  });
});
