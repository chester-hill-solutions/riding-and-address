import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
} from 'react-router';

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
        <style>{`
          :root {
            --bg: #0f1c14;
            --surface: #1a2e22;
            --text: #e8f0ea;
            --muted: #8fa896;
            --accent: #c4a35a;
            --border: #2d4536;
          }
          * { box-sizing: border-box; }
          body {
            margin: 0;
            font-family: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
            background: radial-gradient(1200px 600px at 10% -10%, #243d2e, var(--bg));
            color: var(--text);
            min-height: 100vh;
          }
          a { color: var(--accent); }
          .shell { max-width: 920px; margin: 0 auto; padding: 2rem 1.25rem 4rem; }
          .nav { display: flex; gap: 1rem; align-items: baseline; margin-bottom: 2rem; flex-wrap: wrap; }
          .nav .brand { font-size: 1.5rem; font-weight: 700; color: var(--text); text-decoration: none; letter-spacing: -0.02em; }
          .nav a { text-decoration: none; color: var(--muted); font-size: 0.95rem; }
          .panel { background: color-mix(in srgb, var(--surface) 92%, black); border: 1px solid var(--border); border-radius: 8px; padding: 1.25rem 1.5rem; }
          label { display: block; margin: 0.75rem 0 0.25rem; color: var(--muted); font-size: 0.85rem; }
          input, select, textarea {
            width: 100%; padding: 0.55rem 0.7rem; border-radius: 6px;
            border: 1px solid var(--border); background: #122018; color: var(--text);
            font: inherit;
          }
          button, .btn {
            display: inline-block; margin-top: 1rem; padding: 0.55rem 1rem;
            border-radius: 6px; border: 1px solid var(--accent); background: var(--accent);
            color: #1a1408; font-weight: 600; cursor: pointer; text-decoration: none; font: inherit;
          }
          button.secondary { background: transparent; color: var(--accent); }
          .muted { color: var(--muted); }
          .error { color: #f0a0a0; }
          table { width: 100%; border-collapse: collapse; margin-top: 1rem; font-size: 0.9rem; }
          th, td { text-align: left; padding: 0.5rem 0.35rem; border-bottom: 1px solid var(--border); }
          code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.85em; }
        `}</style>
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
