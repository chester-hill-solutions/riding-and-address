/**
 * Portal schema: Better Auth tables from CHS + app Customer projection metadata.
 * Workspace = Customer org (maps to Worker customer:{id}).
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
} from '@chester-hill-solutions/auth-postgres/schema';

import { boolean, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { workspaces } from '@chester-hill-solutions/auth-postgres/schema';

/** CanCoder billing fields projected alongside CHS workspace. */
export const customerBilling = pgTable('customer_billing', {
  workspaceId: text('workspace_id')
    .primaryKey()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  /** Same id used in Worker KV `customer:{id}`. */
  customerId: text('customer_id').notNull().unique(),
  plan: text('plan').notNull().default('free'),
  fuseLimit: integer('fuse_limit').notNull().default(1000), // keep in sync with DEFAULT_FREE_MONTHLY_ALLOWANCE
  fuseSoftWarn: boolean('fuse_soft_warn').notNull().default(false),
  batchEnabled: boolean('batch_enabled').notNull().default(false),
  stripeCustomerId: text('stripe_customer_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/** Local mirror of minted keys (secrets never stored for server keys after display). */
export const apiKeyMirror = pgTable('api_key_mirror', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  customerId: text('customer_id').notNull(),
  kind: text('kind').notNull(),
  label: text('label'),
  origins: text('origins'),
  disabled: boolean('disabled').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
