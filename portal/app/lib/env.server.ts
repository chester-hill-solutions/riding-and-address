function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function env() {
  return {
    databaseUrl: process.env.DATABASE_URL?.trim() || '',
    authSecret: process.env.AUTH_SECRET || process.env.SESSION_SECRET || '',
    baseUrl: process.env.BETTER_AUTH_URL || process.env.BASE_URL || 'http://localhost:5173',
    workerProjectionUrl: process.env.WORKER_PROJECTION_URL || 'http://localhost:8787',
    workerProjectionSecret: process.env.WORKER_PROJECTION_SECRET || '',
    stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
    stripePriceMetered: process.env.STRIPE_PRICE_METERED || '',
    paidCheckoutEnabled: process.env.PAID_CHECKOUT_ENABLED === 'true',
    resendApiKey: process.env.RESEND_API_KEY || '',
    emailFrom: process.env.EMAIL_FROM || 'Riding Lookup <noreply@localhost>',
    founderUserIds: (process.env.FOUNDER_USER_IDS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

export function requireEnv() {
  required('DATABASE_URL');
  required('AUTH_SECRET');
  return env();
}
