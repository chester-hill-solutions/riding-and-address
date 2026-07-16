import { Link } from 'react-router';
import type { Route } from './+types/home';
import {
  DEFAULT_FREE_MONTHLY_ALLOWANCE,
  formatMeteredUnitPrice,
} from '~/lib/pricing';

export function meta(): Route.MetaDescriptors {
  return [
    { title: 'Riding & Address portal' },
    {
      name: 'description',
      content:
        'Canadian address geocoding, autocomplete, and electoral district API. Mint Server and Browser keys, watch monthly usage, and manage fuse settings.',
    },
  ];
}

export default function Home() {
  return (
    <>
      <header className="site-header">
        <nav className="nav shell" aria-label="Main navigation">
          <Link className="brand" to="/">
            Riding & Address
          </Link>
          <div className="nav__links">
            <a href="#how-it-works">How it works</a>
            <a href="#pricing">Pricing</a>
            <Link to="/login">Log in</Link>
            <Link className="btn btn--compact" to="/signup">
              Start free
            </Link>
          </div>
        </nav>
      </header>

      <main>
        <section className="hero shell">
          <div className="hero__copy">
            <h1>Resolve Canadian addresses to federal and provincial ridings.</h1>
            <p className="hero__lead">
              Geocode, autocomplete, and map any Canadian address to its riding. Built for campaign
              tools, civic products, and internal data workflows.
            </p>
            <div className="button-row">
              <Link className="btn" to="/signup">
                Get an API key
              </Link>
              <a className="text-link" href="#pricing">
                See pricing
              </a>
            </div>
            <p className="fine-print">
              No credit card · {DEFAULT_FREE_MONTHLY_ALLOWANCE.toLocaleString('en-CA')} successful
              calls included each month
            </p>
          </div>
          <div className="request-demo" aria-label="Example API request and response">
            <div className="request-demo__bar">
              <span>Example lookup</span>
              <span className="status-dot">200 OK</span>
            </div>
            <pre>
              <code>{`GET /api/lookup?postal=K1A%200A6
Authorization: Bearer sk_••••••••

{
  "properties": {
    "FED_NUM": "35047",
    "FED_NAME": "Ottawa Centre",
    "PROV_TERR": "Ontario"
  }
}`}</code>
            </pre>
          </div>
        </section>

        <section className="section shell" id="how-it-works">
          <div className="section-heading">
            <h2>From signup to first result in three steps</h2>
            <p>No sales call or account configuration required.</p>
          </div>
          <ol className="steps">
            <li>
              <span className="step-number">1</span>
              <div>
                <h3>Create your organization</h3>
                <p>Invite teammates and keep keys, usage, and billing in one workspace.</p>
              </div>
            </li>
            <li>
              <span className="step-number">2</span>
              <div>
                <h3>Choose the right key</h3>
                <p>Use a private Server key or an origin-restricted Browser key.</p>
              </div>
            </li>
            <li>
              <span className="step-number">3</span>
              <div>
                <h3>Make your first request</h3>
                <p>Only successful 200 responses count toward monthly usage.</p>
              </div>
            </li>
          </ol>
        </section>

        <section className="section section--pricing" id="pricing">
          <div className="shell">
            <div className="section-heading">
              <h2>Start free. Pay only when usage grows.</h2>
              <p>A billable unit is one successful lookup or search. Errors are never billed.</p>
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
          <span>Riding & Address by Chester Hill Solutions</span>
          <Link to="/login">Customer login</Link>
        </div>
      </footer>
    </>
  );
}
