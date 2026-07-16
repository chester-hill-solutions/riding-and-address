/**
 * Portal schema: Better Auth tables from CHS + app Customer projection metadata.
 * Workspace = Customer org (maps to Worker customer:{id}). D1/SQLite — see
 * portal/migrations/0001_init.sql for the DDL (mirrors @chester-hill-solutions/auth-d1's schema).
 */
export {
  user,
  session,
  account,
  verification,
  authSchema,
  workspaces,
  workspaceMembers,
  workspaceInvitations,
  workspaceRoles,
  workspaceFeatures,
  workspaceFeaturePermissions,
} from '@chester-hill-solutions/auth-d1/schema';

import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { workspaces } from '@chester-hill-solutions/auth-d1/schema';

/** CanCoder billing fields projected alongside CHS workspace. */
export const customerBilling = sqliteTable('customer_billing', {
  workspaceId: text('workspace_id')
    .primaryKey()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  /** Same id used in Worker KV `customer:{id}`. */
  customerId: text('customer_id').notNull().unique(),
  plan: text('plan').notNull().default('free'),
  fuseLimit: integer('fuse_limit').notNull().default(1000), // keep in sync with DEFAULT_FREE_MONTHLY_ALLOWANCE
  fuseSoftWarn: integer('fuse_soft_warn', { mode: 'boolean' }).notNull().default(false),
  batchEnabled: integer('batch_enabled', { mode: 'boolean' }).notNull().default(false),
  stripeCustomerId: text('stripe_customer_id'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

/** Local mirror of minted keys (secrets never stored for server keys after display). */
export const apiKeyMirror = sqliteTable('api_key_mirror', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  customerId: text('customer_id').notNull(),
  kind: text('kind').notNull(),
  label: text('label'),
  origins: text('origins'),
  disabled: integer('disabled', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});
