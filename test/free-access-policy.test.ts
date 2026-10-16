import { describe, expect, it } from 'vitest';
import { freeEmailIdentity, isSignupRequest } from '../src/free-access-policy';

describe('free-access abuse controls', () => {
  it('uses the same verified identity for common email aliases', () => {
    for (const email of ['Some.Name@gmail.com', 'somename+private@gmail.com', 'some.name+browser@googlemail.com'])
      expect(freeEmailIdentity(email)).toBe('somename@gmail.com');
    expect(freeEmailIdentity('owner+private@example.com')).toBe('owner@example.com');
    expect(freeEmailIdentity('other@example.com')).not.toBe(freeEmailIdentity('owner@example.com'));
  });
  it('covers the auth API and all portal signup POST spellings', () => {
    for (const path of ['/signup', '/signup.data', '/signup/_.data', '/signup/', '/SIGNUP', '/%73ignup', '/signup%2edata', '/api/auth/sign-up/email', '/api/auth/sign-up/email/', '/api/auth/%73ign-up/email'])
      expect(isSignupRequest('POST', path), path).toBe(true);
    for (const path of ['/login', '/api/auth/sign-in/email', '/signup-other', '/app/uploads', '/broken%'])
      expect(isSignupRequest('POST', path), path).toBe(false);
    expect(isSignupRequest('GET', '/signup')).toBe(false);
  });
});
