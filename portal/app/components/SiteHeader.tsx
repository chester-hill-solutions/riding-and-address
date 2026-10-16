import { Link } from 'react-router';
import { PUBLIC_NAVIGATION } from '../../../src/site-chrome';
import { Badge } from './ui/badge';

export function SiteHeader({ plan }: { plan?: string }) {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link className="site-brand" to={plan ? '/app' : '/'}>
          <span className="site-brand__symbol" aria-hidden="true">CC</span>
          CanCoder
        </Link>
        <nav className="site-nav" aria-label="Main navigation">
          {PUBLIC_NAVIGATION.filter((item) => !plan || item.href.startsWith('/docs')).map((item) => (
            <a key={item.href} href={item.href}>{item.label}</a>
          ))}
        </nav>
        <div className="site-header__actions">
          {plan ? (
            <>
              <Badge variant="secondary">{plan} API plan</Badge>
              <span className="site-account">Your workspace</span>
            </>
          ) : (
            <>
              <Link className="site-login" to="/login">Log in</Link>
              <Link className="site-action" to="/signup">Start free</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell">
        <span>CanCoder <span className="muted">by Chester Hill Solutions</span></span>
        <nav className="site-footer__links" aria-label="Footer navigation">
          <a href="/docs">API docs</a>
          <a href="/docs/embed">Widget guide</a>
          <Link to="/login">Log in</Link>
        </nav>
      </div>
    </footer>
  );
}
