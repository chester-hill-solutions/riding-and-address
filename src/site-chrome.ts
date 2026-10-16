/** Shared brand and navigation for React pages and standalone API documentation. */
export const SITE_FONT_STYLESHEET = 'https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600;700;800&family=Source+Serif+4:opsz,wght@8..60,600;8..60,700&display=swap';

export const PUBLIC_NAVIGATION = [
  { label: 'Product', href: '/#how-it-works' },
  { label: 'Pricing', href: '/#pricing' },
  { label: 'API docs', href: '/docs' },
  { label: 'Widget', href: '/docs/embed' },
] as const;

export const SITE_BRAND_STYLES = `
:root {
  --site-font: "Source Sans 3", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --site-display: "Source Serif 4", Georgia, serif;
  --site-ink: #132033; --site-muted: #5a687c; --site-canvas: #eef3f8;
  --site-primary: #1457a6; --site-primary-strong: #0c4488; --site-primary-soft: #e7f0fb;
  --site-border: #d0dbe8; --site-header-height: 76px;
}
.site-header, .site-header * { box-sizing: border-box; }
.site-header { background: #fff; border-bottom: 1px solid var(--site-border); }
.site-header__inner { max-width: 1160px; padding: 16px 24px; min-height: 76px; margin: auto; display: flex; align-items: center; gap: 36px; }
.site-brand { display: inline-flex; align-items: center; gap: 10px; color: var(--site-ink); text-decoration: none; font: 700 22px/1 var(--site-display); letter-spacing: -.6px; white-space: nowrap; }
.site-brand:hover { color: var(--site-primary); }
.site-brand__symbol { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 9px; background: var(--site-primary); color: #fff; font: 700 12px/1 var(--site-font); letter-spacing: -.4px; }
.site-nav { display: flex; align-items: center; gap: 24px; margin-left: 16px; }
.site-nav a, .site-login { color: var(--site-muted); text-decoration: none; white-space: nowrap; font: 550 14px/1.5 var(--site-font); }
.site-nav a { display: inline-flex; align-items: center; min-height: 32px; }
.site-nav a:hover, .site-nav a[aria-current="page"], .site-login:hover { color: var(--site-primary); }
.site-header__actions { margin-left: auto; display: flex; align-items: center; gap: 20px; }
.site-action { display: inline-flex; align-items: center; justify-content: center; min-height: 42px; padding: 10px 17px; border: 1px solid var(--site-primary); border-radius: 8px; background: var(--site-primary); color: #fff; text-decoration: none; font: 650 14px/1.4 var(--site-font); white-space: nowrap; }
.site-action:hover { background: var(--site-primary-strong); color: #fff; }
.site-account { color: var(--site-muted); font: 550 14px/1.5 var(--site-font); }
.site-header a:focus-visible { outline: 3px solid #9ebce9; outline-offset: 4px; border-radius: 5px; }
@media (max-width: 800px) {
  :root { --site-header-height: 120px; }
  .site-header__inner { display: grid; grid-template-columns: 1fr auto; gap: 16px; padding: 16px 20px; }
  .site-header__actions { grid-column: 2; grid-row: 1; gap: 14px; }
  .site-nav { grid-column: 1 / -1; grid-row: 2; margin: 0; gap: 24px; overflow-x: auto; padding-block: 2px; }
  .site-action { min-height: 38px; padding: 8px 13px; }
}
@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto !important; } }
`;

export function renderSiteHeader(active: 'API docs' | 'Widget'): string {
  return `<header class="site-header"><div class="site-header__inner">
    <a class="site-brand" href="/"><span class="site-brand__symbol" aria-hidden="true">CC</span>CanCoder</a>
    <nav class="site-nav" aria-label="Main navigation">${PUBLIC_NAVIGATION.map((item) =>
      `<a href="${item.href}"${item.label === active ? ' aria-current="page"' : ''}>${item.label}</a>`
    ).join('')}</nav>
    <div class="site-header__actions"><a class="site-login" href="/login">Log in</a><a class="site-action" href="/signup">Start free</a></div>
  </div></header>`;
}
