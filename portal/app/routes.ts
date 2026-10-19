import { type RouteConfig, index, route } from '@react-router/dev/routes';

export default [
  index('routes/home.tsx'),
  route('login', 'routes/login.tsx'),
  route('signup', 'routes/signup.tsx'),
  // The OAuth consent screen. Better Auth redirects here from the authorization endpoint; see
  // routes/consent.tsx. Registered because `mcp({ consentPage })` names it, and a consent page that
  // 404s would leave an MCP client at a dead end after it had already sent the user to us.
  route('consent', 'routes/consent.tsx'),
  route('api/auth/*', 'routes/api.auth.$.ts'),

  // Every other /.well-known/* path goes to the auth handler: Better Auth serves authorization-server
  // metadata at both RFC 8414 placements, and the portal only routed /api/auth/* to it — so a client
  // that tries the path-inserted form first finds nothing. A real client did exactly that. The API
  // worker owns the protected-resource metadata paths, so those never reach here.
  route('.well-known/*', 'routes/well-known.$.ts'),
  route('api/stripe/webhook', 'routes/api.stripe-webhook.ts'),
  route('app', 'routes/app.tsx', [
    index('routes/app._index.tsx'),
    route('keys', 'routes/app.keys.tsx'),
    route('uploads', 'routes/app.uploads.tsx'),
    route('uploads/:id/results.csv', 'routes/app.upload-results.ts'),
    route('uploads/:id', 'routes/app.upload.tsx'),
    route('billing', 'routes/app.billing.tsx'),
    route('invites', 'routes/app.invites.tsx'),
    route('settings', 'routes/app.settings.tsx'),
    route('admin', 'routes/app.admin.tsx'),
  ]),
] satisfies RouteConfig;
