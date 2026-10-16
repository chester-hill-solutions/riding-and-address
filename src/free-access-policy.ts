/** Common consumer-mail aliases share a grant; browsers and cookies are never identities. */
export function freeEmailIdentity(email: string): string {
  const [local, domain] = email.trim().toLowerCase().split('@');
  if (domain === 'gmail.com' || domain === 'googlemail.com') return `${local.split('+')[0].replace(/\./g, '')}@gmail.com`;
  return `${local.split('+')[0]}@${domain}`;
}

/** Match the same decoded route spellings accepted by the portal and auth handler. */
export function isSignupRequest(method: string, pathname: string): boolean {
  if (method !== 'POST') return false;
  let path: string;
  try { path = decodeURIComponent(pathname).toLowerCase().replace(/\/+$/, ''); } catch { return false; }
  return /^\/signup(?:\.data|\/_\.data)?$/.test(path) || path === '/api/auth/sign-up/email';
}
