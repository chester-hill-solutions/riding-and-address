import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
} from 'react-router';
import type { Route } from './+types/root';
import appStylesheet from './app.css?url';

const FAVICON =
  "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='6' fill='%230f1c14'/><rect x='1' y='1' width='30' height='30' rx='5' fill='none' stroke='%232d4536'/><text x='16' y='23' font-family='Georgia,serif' font-size='19' font-weight='700' text-anchor='middle' fill='%23c4a35a'>R</text></svg>";

export const links: Route.LinksFunction = () => [
  { rel: 'stylesheet', href: appStylesheet },
  { rel: 'icon', type: 'image/svg+xml', href: FAVICON },
];

export function meta(): Route.MetaDescriptors {
  return [
    { title: 'Riding Lookup portal' },
    {
      name: 'description',
      content:
        'Customer portal for the Riding Lookup API: mint Server and Browser keys, watch usage, and manage fuse settings.',
    },
  ];
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: { error: unknown }) {
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : 'Unknown error';
  return (
    <main className="shell">
      <h1>Something went wrong</h1>
      <p className="error">{message}</p>
    </main>
  );
}
