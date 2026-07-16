import { Link } from 'react-router';

export default function Home() {
  return (
    <main className="shell">
      <nav className="nav">
        <Link className="brand" to="/">
          Riding Lookup
        </Link>
        <Link to="/login">Log in</Link>
        <Link to="/signup">Sign up</Link>
        <Link to="/app">Dashboard</Link>
      </nav>
      <section className="panel">
        <h1>Customer portal</h1>
        <p className="muted">
          Mint Server and Browser keys, watch monthly usage against the free allowance, and manage
          fuse settings. Chester Hill Solutions master terms apply; product accuracy notes are in
          the API docs.
        </p>
        <p>
          <Link className="btn" to="/signup">
            Create an organization
          </Link>
        </p>
      </section>
    </main>
  );
}
