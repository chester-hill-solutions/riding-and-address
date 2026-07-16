function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

export function env() {
  const prod = isProduction();
  return {
    databaseUrl: process.env.DATABASE_URL?.trim() || '',
    authSecret: process.env.AUTH_SECRET || process.env.SESSION_SECRET || '',
    // localhost fallbacks are dev-only; production must configure these.
    baseUrl:
      process.env.BETTER_AUTH_URL || process.env.BASE_URL || (prod ? '' : 'http://localhost:5173'),
    workerProjectionUrl:
      process.env.WORKER_PROJECTION_URL || (prod ? '' : 'http://localhost:8787'),
    workerProjectionSecret: process.env.WORKER_PROJECTION_SECRET || '',
    stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
    stripePriceMetered: process.env.STRIPE_PRICE_METERED || '',
    paidCheckoutEnabled: process.env.PAID_CHECKOUT_ENABLED === 'true',
    resendApiKey: process.env.RESEND_API_KEY || '',
    emailFrom: process.env.EMAIL_FROM || (prod ? '' : 'Riding Lookup <noreply@localhost>'),
    founderUserIds: (process.env.FOUNDER_USER_IDS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

/**
 * Fail fast on missing production configuration. Called at server boot
 * (entry.server.tsx) when NODE_ENV === 'production'; dev keeps localhost
 * defaults and no-op email.
 */
export function requireEnv() {
  required('DATABASE_URL');
  if (!(process.env.AUTH_SECRET || process.env.SESSION_SECRET)?.trim()) {
    throw new Error('AUTH_SECRET (or SESSION_SECRET) is required');
  }
  if (!(process.env.BETTER_AUTH_URL || process.env.BASE_URL)?.trim()) {
    throw new Error('BETTER_AUTH_URL (or BASE_URL) is required');
  }
  required('WORKER_PROJECTION_URL');
  required('WORKER_PROJECTION_SECRET');
  required('RESEND_API_KEY');
  required('EMAIL_FROM');
  return env();
}
