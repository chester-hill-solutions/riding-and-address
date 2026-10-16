import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseConfigFileTextToJson } from 'typescript';

const source = readFileSync(new URL('../portal/wrangler.jsonc', import.meta.url), 'utf8');
const { config, error } = parseConfigFileTextToJson('wrangler.jsonc', source);
if (error) throw new Error('Worker deployment configuration is not valid JSONC');

const staging = config.env.staging;

describe('staging deployment isolation', () => {
  it('cannot inherit the production custom domain', () => {
    expect(config.routes).toContainEqual({ pattern: 'cancoder.chesterhillsolutions.ca', custom_domain: true });
    expect(staging.routes).toEqual([]);
  });

  it('uses separate customer, session and database storage', () => {
    const productionKv = new Set(config.kv_namespaces.map((binding: { id: string }) => binding.id));
    for (const binding of staging.kv_namespaces) expect(productionKv.has(binding.id)).toBe(false);
    expect(staging.kv_namespaces.some((binding: { binding: string }) => binding.binding === 'API_KEYS')).toBe(true);
    const productionD1 = new Set(config.d1_databases.map((binding: { database_id: string }) => binding.database_id));
    for (const binding of staging.d1_databases) expect(productionD1.has(binding.database_id)).toBe(false);
  });

  it('enables approved upload checkout while keeping subscriptions off and staging isolated', () => {
    expect(config.vars.PAID_CHECKOUT_ENABLED).toBe('false');
    expect(config.vars.UPLOAD_CHECKOUT_ENABLED).toBe('true');
    expect(config.vars.BASE_URL).toBe('https://cancoder.chesterhillsolutions.ca');
    expect(config.vars.EMAIL_FROM).toBe('CanCoder <noreply@chsolutions.ca>');
    expect(staging.vars.PAID_CHECKOUT_ENABLED).toBe('false');
    expect(staging.vars.UPLOAD_CHECKOUT_ENABLED).toBe('true');
    expect(staging.vars.AUTH_TRUSTED_ORIGINS).toBe(staging.vars.BASE_URL);
    expect(staging.vars.BASE_URL).toBe('https://riding-lookup-staging.chester-hill-solutions.workers.dev');
  });
});
