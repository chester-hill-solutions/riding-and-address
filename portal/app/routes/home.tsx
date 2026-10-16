import { Card } from '~/components/ui/card';
import { LinkButton } from '~/components/ui/button';
import { ActionLink } from '~/components/ActionLink';
import { useLoaderData } from 'react-router';
import type { Route } from './+types/home';
import { SiteHeader, SiteFooter } from '~/components/SiteHeader';
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
  const { demoBrowserKey } = env();
  return {
    apiBaseUrl: '',
    demoBrowserKey,
  };
}

export default function Home() {
  const { apiBaseUrl, demoBrowserKey } = useLoaderData<typeof loader>();
  const docsUrl = '/docs';
  const widgetDocsUrl = '/docs/embed';

  return (
    <div className="marketing">
      <SiteHeader />

      <main>
        <section className="hero-marketing">
          <div className="shell hero-marketing__inner">
            <div className="hero-marketing__copy">
            <p className="eyebrow">Canadian address intelligence</p>
            <h1>From address to riding.<br /><span>In one call.</span></h1>
            <p className="hero-marketing__lead">
              Help people find their address, pinpoint a location, and connect with the right
              electoral district. One API for your forms and campaign tools.
            </p>
            <div className="button-row">
              <ActionLink to="/signup">
                Start free
              </ActionLink>
              <LinkButton variant="outline" size="touch" className="marketing-outline" href="#try-it">
                Try a lookup
              </LinkButton>
            </div>
            <p className="fine-print">
              No credit card · {DEFAULT_FREE_MONTHLY_ALLOWANCE.toLocaleString('en-CA')} calls / month
            </p>
            </div>
            <div className="address-preview" aria-label="Example address lookup result">
              <div className="address-preview__bar"><span className="eyebrow">Example lookup</span><span className="address-preview__tag">Canada</span></div>
              <p className="address-preview__address">111 Wellington St</p>
              <p className="address-preview__locality">Ottawa, Ontario · K1A 0A6</p>
              <dl><div><dt>Federal district</dt><dd>Ottawa Centre</dd></div>
                <div><dt>Provincial district</dt><dd>Ottawa Centre</dd></div></dl>
              <a href="#try-it">Try your own address <span aria-hidden="true">→</span></a>
            </div>
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
              <p>A complete address workflow, from the first keystroke to the right district.</p>
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
                    Canadian address data turns a street address or postal code into a location.
                    Match quality is included, so you know how close the result is.
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
              <ActionLink to="/signup">
                Get an API key
              </ActionLink>
              <LinkButton variant="outline" size="touch" className="marketing-outline" href={docsUrl}>
                View docs
              </LinkButton>
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
              <Card role="article" className="price-card gap-0 p-6 sm:p-8">
                <h3>Free</h3>
                <p className="price">$0</p>
                <p className="price-detail">No expiry and no credit card</p>
                <ul className="check-list">
                  <li>{DEFAULT_FREE_MONTHLY_ALLOWANCE.toLocaleString('en-CA')} calls / month</li>
                  <li>Server and Browser keys</li>
                  <li>Usage dashboard and hard fuse</li>
                </ul>
                <ActionLink to="/signup">
                  Start free
                </ActionLink>
              </Card>
              <Card role="article" className="price-card price-card--featured gap-0 p-6 sm:p-8">
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
                <ActionLink to="/signup">
                  Create an account
                </ActionLink>
              </Card>
            </div>
            <p className="pricing-note">
              Usage resets each UTC calendar month. Paid access is enabled after the product
              addendum is signed.
            </p>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
