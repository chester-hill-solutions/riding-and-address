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
  "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='5' fill='%231457a6'/><text x='16' y='21' font-family='Arial,sans-serif' font-size='11' font-weight='700' text-anchor='middle' fill='white'>CC</text></svg>";

export const links: Route.LinksFunction = () => [
  { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
  { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
  {
    rel: 'stylesheet',
    href: 'https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600;700;800&family=Source+Serif+4:opsz,wght@8..60,600;8..60,700&display=swap',
  },
  { rel: 'stylesheet', href: appStylesheet },
  { rel: 'icon', type: 'image/svg+xml', href: FAVICON },
];

export function meta(): Route.MetaDescriptors {
  return [
    { title: 'CanCoder portal' },
    {
      name: 'description',
      content:
        'Customer portal for the CanCoder API: mint Server and Browser keys, watch usage, and manage fuse settings.',
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
