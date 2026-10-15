import type { ReactNode } from 'react';
import { SiteHeader, SiteFooter } from './SiteHeader';
import { Panel } from './Panel';

export function AuthLayout({ title, description, children }: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="auth-layout">
      <SiteHeader />
      <main className="auth-main">
        <Panel title={title}>
          <p className="auth-description">{description}</p>
          {children}
        </Panel>
      </main>
      <SiteFooter />
    </div>
  );
}
