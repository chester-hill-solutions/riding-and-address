import { type RouteConfig, index, route } from '@react-router/dev/routes';

export default [
  index('routes/home.tsx'),
  route('login', 'routes/login.tsx'),
  route('signup', 'routes/signup.tsx'),
  route('api/auth/*', 'routes/api.auth.$.ts'),
  route('api/stripe/webhook', 'routes/api.stripe-webhook.ts'),
  route('app', 'routes/app.tsx', [
    index('routes/app._index.tsx'),
    route('keys', 'routes/app.keys.tsx'),
    route('billing', 'routes/app.billing.tsx'),
    route('invites', 'routes/app.invites.tsx'),
    route('settings', 'routes/app.settings.tsx'),
    route('admin', 'routes/app.admin.tsx'),
  ]),
] satisfies RouteConfig;
