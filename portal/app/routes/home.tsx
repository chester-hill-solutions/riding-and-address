import { Link, useLoaderData } from 'react-router';
import type { Route } from './+types/home';
import { TryRidingForm } from '~/components/TryRidingForm';
import { env } from '~/lib/env.server';
import {
  DEFAULT_FREE_MONTHLY_ALLOWANCE,
  formatMeteredUnitPrice,
} from '~/lib/pricing';

export function meta(): Route.MetaDescriptors {
  return [
    { title: 'CanCoder' },
    {
      name: 'description',
      content:
        'Canadian address geocoding, autocomplete, and electoral district API for campaign tools and forms.',
    },
  ];
}

export function loader() {
  const { publicApiBaseUrl, demoBrowserKey } = env();
  return {
    apiBaseUrl: publicApiBaseUrl.replace(/\/$/, ''),
    demoBrowserKey,
  };
}

export default function Home() {
  const { apiBaseUrl, demoBrowserKey } = useLoaderData<typeof loader>();
  const docsUrl = `${apiBaseUrl}/docs`;

  return (
    <div className="marketing">
      <header className="site-header site-header--marketing">
        <nav className="nav shell" aria-label="Main navigation">
          <Link className="brand" to="/">
            CanCoder
          </Link>
          <div className="nav__links">
            <a href="#try-it">Try it</a>
            <a href="#how-it-works">Product</a>
            <a href="#pricing">Pricing</a>
            <a href={docsUrl}>Docs</a>
            <Link to="/login">Log in</Link>
            <Link className="btn btn--compact" to="/signup">
              Start free
            </Link>
          </div>
        </nav>
      </header>

      <main>
        <section className="hero-marketing">
          <div className="hero-marketing__atmosphere" aria-hidden="true" />
          <div className="shell hero-marketing__inner">
            <h1>CanCoder</h1>
            <p className="hero-marketing__lead">
              Turn any Canadian address into its electoral riding. Geocode, autocomplete, and map
              to federal and provincial districts — for campaign tools and form vendors.
            </p>
            <div className="button-row">
              <Link className="btn" to="/signup">
                Start free
              </Link>
              <a className="btn btn--ghost" href="#try-it">
                Try a lookup
              </a>
            </div>
            <p className="fine-print">
              No credit card · {DEFAULT_FREE_MONTHLY_ALLOWANCE.toLocaleString('en-CA')} calls / month
            </p>
          </div>
        </section>

        <section className="section shell" id="try-it">
          <div className="section-heading">
            <h2>Try it on a real address</h2>
            <p>
              Start typing a Canadian address. This is the same <code>/embed.js</code> autocomplete
              widget you can drop into any form.
            </p>
          </div>
          <TryRidingForm apiBaseUrl={apiBaseUrl} demoBrowserKey={demoBrowserKey} />
        </section>

        <section className="section section--how" id="how-it-works">
          <div className="shell">
            <div className="section-heading">
              <h2>What CanCoder does</h2>
              <p>Three products in one API — autocomplete, geocode, and riding lookup.</p>
            </div>
            <ol className="flow">
              <li>
                <span className="flow__num" aria-hidden="true">
                  1
                </span>
                <div className="flow__body">
                  <h3>Address autocomplete</h3>
                  <p>
                    Drop-in embed for your forms. As-you-type Canadian suggestions via{' '}
                    <code>/embed.js</code>, then hand off a clean address on select.
                  </p>
                </div>
              </li>
              <li>
                <span className="flow__num" aria-hidden="true">
                  2
                </span>
                <div className="flow__body">
                  <h3>Canadian geocoding</h3>
                  <p>
                    Self-hosted StatCan address data turns a postal code or street address into a
                    precise point — normalize and reverse geocode when you need them.
                  </p>
                </div>
              </li>
              <li>
                <span className="flow__num" aria-hidden="true">
                  3
                </span>
                <div className="flow__body">
                  <h3>Electoral riding lookup</h3>
                  <p>
                    Point-in-polygon against official boundaries returns federal and provincial
                    ridings — names and codes ready for routing and tagging.
                  </p>
                </div>
              </li>
            </ol>
            <div className="button-row button-row--section">
              <Link className="btn" to="/signup">
                Get an API key
              </Link>
              <a className="btn btn--ghost" href={docsUrl}>
                View docs
              </a>
            </div>
          </div>
        </section>

        <section className="section section--pricing" id="pricing">
          <div className="shell">
            <div className="section-heading">
              <h2>Start free. Pay only when usage grows.</h2>
              <p>Successful lookups and searches count. Errors never do.</p>
            </div>
            <div className="pricing-grid">
              <article className="price-card">
                <h3>Free</h3>
                <p className="price">$0</p>
                <p className="price-detail">No expiry and no credit card</p>
                <ul className="check-list">
                  <li>{DEFAULT_FREE_MONTHLY_ALLOWANCE.toLocaleString('en-CA')} calls / month</li>
                  <li>Server and Browser keys</li>
                  <li>Usage dashboard and hard fuse</li>
                </ul>
                <Link className="btn" to="/signup">
                  Start free
                </Link>
              </article>
              <article className="price-card price-card--featured">
                <h3>Metered</h3>
                <p className="price">
                  {formatMeteredUnitPrice()}
                  <span> USD</span>
                </p>
                <p className="price-detail">per successful call after the free allowance</p>
                <ul className="check-list">
                  <li>Includes the free monthly allowance</li>
                  <li>No charge for 4xx or 5xx responses</li>
                  <li>Set a monthly hard limit at any time</li>
                </ul>
                <Link className="btn" to="/signup">
                  Create an account
                </Link>
              </article>
            </div>
            <p className="pricing-note">
              Usage resets each UTC calendar month. Paid access is enabled after the product
              addendum is signed.
            </p>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="shell">
          <span>CanCoder by Chester Hill Solutions</span>
          <div className="site-footer__links">
            <a href={docsUrl}>Docs</a>
            <Link to="/login">Customer login</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
