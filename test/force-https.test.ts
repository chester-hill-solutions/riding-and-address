import { describe, it, expect } from 'vitest';
import { forceHttpsRedirect } from '../src/force-https';

/**
 * A plain-HTTP request must not be served. The Worker sees the client's scheme in `request.url`, and
 * everything downstream builds canonical URLs from it, so an `http:` request that reaches the router
 * produces `http://` links as well as an insecure response. HSTS does not help the first visit.
 */

const redirect = (url: string, init?: RequestInit) =>
  forceHttpsRedirect(new Request(url, init));

describe('forceHttpsRedirect', () => {
  it('leaves an HTTPS request alone', () => {
    expect(redirect('https://cancoder.example/api/federal?postal=K1A0A6')).toBeNull();
  });

  it('redirects a plain-HTTP request, preserving the path and query', () => {
    const response = redirect('http://cancoder.example/api/federal?postal=K1A0A6');
    expect(response?.status).toBe(308);
    expect(response?.headers.get('location')).toBe('https://cancoder.example/api/federal?postal=K1A0A6');
  });

  it('uses 308 so a POST keeps its method and body', () => {
    // 301/302 would let a client resend a POST as a GET.
    const response = redirect('http://cancoder.example/api/quote', { method: 'POST', body: '{}' });
    expect(response?.status).toBe(308);
  });

  it('redirects the bare root', () => {
    expect(redirect('http://cancoder.example')?.headers.get('location')).toBe('https://cancoder.example/');
  });

  it('leaves loopback hosts alone, so local development still works', () => {
    for (const host of ['localhost', '127.0.0.1', '[::1]', 'app.localhost']) {
      expect(redirect(`http://${host}:8787/`)).toBeNull();
      expect(redirect(`http://${host}/api/docs`)).toBeNull();
    }
  });
});
