# @chester-hill-solutions/auth-d1

Cloudflare D1 (SQLite) auth provider — Better Auth factory, session reader, Drizzle
`sqlite-core` schema, and plugins. Mirrors `@chester-hill-solutions/auth-postgres`'s
public API so app code can switch providers without touching call sites; the D1-specific
concerns (no server-side functions, no interactive transactions) are handled internally.

**Install:** [docs/USING-PACKAGES.md](../../docs/USING-PACKAGES.md)

```bash
bun add @chester-hill-solutions/auth@^0.14.0 @chester-hill-solutions/auth-d1@^0.11.0
```

**Peers:** `better-auth`, `@better-auth/drizzle-adapter`, `drizzle-orm`.

**Version:** keep aligned with `@chester-hill-solutions/auth`.

## Example

```typescript
import { auth as configureAuth, createSessionReader } from "@chester-hill-solutions/auth-d1";
import { drizzleAdapter } from "@chester-hill-solutions/auth-d1/drizzle-adapter";
import { magicLink } from "@chester-hill-solutions/auth-d1/plugins";
import { drizzle } from "drizzle-orm/d1";
import { authSchema } from "@chester-hill-solutions/auth-d1/schema";

// env.DB is the D1Database binding from your Worker's env
const db = drizzle(env.DB, { schema: authSchema });

export const auth = configureAuth({
  database: drizzleAdapter(db, { provider: "sqlite" }),
  plugins: [magicLink({ ... })],
  secret: env.AUTH_SECRET,
});

export const session = createSessionReader(auth);
```

Use `provider: "sqlite"` (not `"pg"`) when calling `drizzleAdapter`. Better Auth's
`transaction` adapter option already **defaults to `false`**, meaning operations run
sequentially instead of being wrapped in a DB transaction — this is what you want for D1,
so there is nothing to configure. Do not set `transaction: true`; D1 does not support the
interactive, multi-round-trip transactions Better Auth's transaction mode expects.

## Subpath exports

| Import | Purpose |
|--------|---------|
| `@chester-hill-solutions/auth-d1` | Auth factory, session reader, workspace-access helpers, workspace API keys |
| `@chester-hill-solutions/auth-d1/drizzle-adapter` | Drizzle adapter (use with `provider: "sqlite"`) |
| `@chester-hill-solutions/auth-d1/plugins` | Better Auth plugins every deployment can resolve: `magicLink`, `jwt` |
| `@chester-hill-solutions/auth-d1/plugins/mcp` | The MCP OAuth provider plugin (optional peer) |
| `@chester-hill-solutions/auth-d1/plugins/oauth-provider` | The OAuth provider plugin (optional peer) |
| `@chester-hill-solutions/auth-d1/plugins/cimd` | Client ID Metadata Document support (optional peer) |
| `@chester-hill-solutions/auth-d1/schema` | Drizzle `sqlite-core` schema tables (auth + workspace + OAuth) |
| `@chester-hill-solutions/auth-d1/testing` | In-memory `bun:sqlite` test DB helpers + DDL fixtures |

## OAuth provider & MCP (0.7.0+)

The OAuth authorization server and the MCP client profile, with the tables they need.

**Eight tables, not the five Better Auth's `@better-auth/mcp` documentation names.** The package
declares seven OAuth models — `oauthClient`, `oauthResource`, `oauthClientResource`,
`oauthRefreshToken`, `oauthAccessToken`, `oauthConsent`, `oauthClientAssertion` — and the `jwt()`
plugin, which the MCP plugin requires, adds `jwks`. The docs are incomplete; the code is the
source of truth.

- `oauthSchema` — the Drizzle declarations, for `drizzleAdapter({ schema })`
- `OAUTH_DDL` — the DDL a deployment provisions. **Apply `AUTH_DDL` first**: three of these tables
  reference `user` and `session`.
- `./plugins/mcp`, `./plugins/oauth-provider`, `./plugins/cimd` — the three OAuth plugins, each
  behind its own subpath because each comes from an **optional peer**. `./plugins` carries only
  `magicLink` and `jwt`, which come from `better-auth` itself. One entry point re-exporting all
  five would make the optional peers mandatory in practice, which is worse than no metadata at all:
  it is the metadata people trust.

**The sibling `auth-postgres` ships the same eight tables** for Postgres, and the two are held to
the same assertions by the shared runner in `@chester-hill-solutions/auth/testing` — a disagreement
between the dialects fails twice rather than in whichever one a reviewer happened to read.

## Workspace API keys (0.8.0+)

Opaque keys (`chs_live_<token>` by default; pass `keyPrefix` for product conventions like `mm_test`). Only the SHA-256 hash is stored.

The sibling `auth-postgres` ships the same subsystem, and the two are the same table in two
dialects: the same columns, the same capability vocabulary, the same rules. Only the spelling of
the types differs — `text` holds the capability allowlist as JSON, because D1 has no array type.

- `createApiKey` — issue a key with a capability allowlist; raw key returned exactly once
- `verifyApiKey` — resolve a presented key to a `ApiKeyAuthorizationActor` and touch `last_used_at`
- `rotateApiKey` / `revokeApiKey` / `listApiKeys` — lifecycle scoped to the workspace
- `WORKSPACE_API_KEY_DDL` + `workspaceApiKeys` Drizzle table

## Defaults

Every default this package exports. A default that only exists in code is a trap, so C6 in
[docs/PACKAGE-CONVENTIONS.md](../../../docs/PACKAGE-CONVENTIONS.md) requires this section to
exist. A gate checks that the names here match the names the package exports.

| Constant | Value | Effect |
|---|---|---|
| `DEFAULT_API_KEY_PREFIX` | `"chs_live"` | Prefix on a generated API key. A consumer comparing key strings must account for it, and a live key is identifiable by it |

The gate checks names, not values. It cannot tell that this is still `chs_live`.

## D1 / SQLite schema notes

- **Text UUID primary keys.** D1/SQLite has no native `uuid` type; `id` columns are
  `text` populated by `crypto.randomUUID()` via `$defaultFn`, including `user.id` (a
  `uuid` column in `auth-postgres`).
- **Timestamps are `integer` in `timestamp_ms` mode.** Dates round-trip as milliseconds
  since epoch; Drizzle maps `Date` <-> integer automatically. Hand-written DDL/migrations
  default new rows to `(unixepoch() * 1000)`.
- **Booleans are `integer` in `boolean` mode** (`0`/`1` on disk, `boolean` in JS).
- Foreign keys use `ON DELETE CASCADE` same as Postgres. D1 enforces `PRAGMA foreign_keys`
  by default; the local test harness sets it explicitly for `bun:sqlite`.

## No Postgres RPC for feature permissions

`auth-postgres` gates workspace features with a Postgres `check_workspace_feature_permission`
SQL function (`CREATE OR REPLACE FUNCTION ...`). SQLite/D1 has no server-side function
catalog, so `checkWorkspaceFeaturePermission` here runs the equivalent logic as a portable
Drizzle query instead: fetch the workspace-specific and global (`workspace_id IS NULL`)
permission rows in one `SELECT`, then prefer the workspace-specific row in application code.
Same deny-by-default semantics, same public function signature, no DB-side function needed.

Two global rows for the same `(role, feature)` can coexist, because SQL treats a null
`workspace_id` as distinct and the unique index cannot arbitrate between them. Both dialects
resolve that tie to the stricter answer, so a global revoke takes effect instead of depending
on which row the database happens to return first.

```typescript
import {
  canAccessWorkspaceFeature,
  createRequireWorkspaceFeature,
  WorkspaceFeatureAccessError,
} from "@chester-hill-solutions/auth-d1";

const requireBilling = createRequireWorkspaceFeature("app.billing");

await requireBilling(db, { workspaceId, userId });

const allowed = await canAccessWorkspaceFeature(db, {
  workspaceId,
  userId,
  featureId: "app.billing",
});
```

For route guards with role hierarchy only (deprecated for new code):

```typescript
import { createRequireWorkspaceRole } from "@chester-hill-solutions/auth-d1";

const requireAdmin = createRequireWorkspaceRole("admin");
await requireAdmin(db, { workspaceId, userId });
```

The workspace tables are exported from `@chester-hill-solutions/auth-d1/schema` alongside
the auth tables.

## Invitations & D1 transaction limits

`workspace_invitation` schema + `createInvitation` / `resendInvitation` / `cancelInvitation`
/ `redeemInvitation` port directly from `auth-postgres`, **except `redeemInvitation`'s
atomicity strategy**:

- Cloudflare D1 does not support Postgres-style interactive transactions that span multiple
  round trips (`BEGIN` ... await ... `COMMIT`). Drizzle's D1 driver technically exposes a
  `.transaction()` method, but it issues raw `begin`/`commit`/`rollback` statements that do
  not give you real cross-statement atomicity or rollback-on-failure guarantees against the
  D1 storage layer — **do not rely on it here.**
- Instead, `redeemInvitation` does two sequential operations: (1) a single **compare-and-set
  `UPDATE ... WHERE status = 'pending' AND expires_at > now`** that is the real atomicity
  boundary for resolving concurrent redeem races, followed by (2) an **upsert** of the
  membership row on `(workspace_id, user_id)`.
- If step 2 fails after step 1 succeeds (worker eviction, network blip — rare but possible
  without a transaction), the invitation is left `accepted` with no membership row. The next
  `redeemInvitation` call for the *same user* detects this
  (`status === "accepted" && acceptedByUserId === userId`) and creates the missing membership
  idempotently instead of erroring. This makes retries and double-submits safe by design.
- If you need genuinely atomic multi-statement writes on D1 outside of this package, look at
  `db.batch(...)` (D1's batch API *is* atomic — all-or-nothing — unlike `.transaction()`),
  but note `batch()` takes an array of query builders up front, not a sequence that branches
  on intermediate results, so it doesn't fit this CAS-then-insert flow.
- `WORKSPACE_INVITATION_DDL` uses a **partial unique index**
  (`... WHERE "status" = 'pending'`) for one pending invite per workspace/email — SQLite
  supports partial indexes, same as Postgres.

`resendInvitation` and `cancelInvitation` take the workspace the caller is acting in
(`resendInvitation(db, invitationId, workspaceId, options?)`, `cancelInvitation(db, invitationId, workspaceId)`).
An invitation id from another workspace resolves to `INVITE_NOT_FOUND`, so the lifecycle cannot
mint a token for, or cancel, another workspace's pending invite.

### One membership row per (workspace, user)

`workspace_member` carries a unique index on `(workspace_id, user_id)`, and `redeemInvitation`
upserts on it, so a re-invite for a person who already accepted one supersedes their role
instead of adding a second row beside it. Two rows for the same principal would leave the
effective role to whichever row the database returns first, and the earlier, higher role is the
one that keeps winning. A database that has not been migrated can still hold both rows; until
it has, `getWorkspaceMemberRoleId` refuses to guess and reports no role at all.

```typescript
import { createInvitation, redeemInvitation } from "@chester-hill-solutions/auth-d1";

const { invitation, rawToken } = await createInvitation(db, {
  id: crypto.randomUUID(),
  workspaceId,
  email: "new-teammate@example.com",
  roleId: "editor",
  invitedByUserId: currentUserId,
}, { roles });
// email rawToken to the invitee; only tokenHash is stored

const { membershipId, alreadyAccepted } = await redeemInvitation(db, {
  invitationId: invitation.id,
  rawToken,
  userId: authenticatedUserId,
  verifiedEmail: authenticatedUserEmail,
}, { roles });
```

### Where roles come from

**The product owns them, not this package.** A role set is a list of `{ id, rank, invites }`
passed to `seedProductRoleCapabilityMatrix`, and both the rank that reaches the database and the
roles a member may invite are read from it. This package holds no ranking of its own.

The vocabulary itself lives in [`@chester-hill-solutions/auth`](../auth/README.md), which both this
package and `auth-postgres` re-export, so the two dialects cannot disagree about it. `PRODUCT_ROLES`
is a default for a caller that has not declared a set; it is not the vocabulary, and its ids
(`owner`, `admin`, `member`, `caller`) mean nothing in a product that did not ask for them.

`assertProductRoles` rejects a hierarchy where a role invites one of equal or higher rank, before
any row is written.

`seedProductRoleCapabilityMatrix` reconciles as well as seeds: a capability that has left a role's
matrix stops being granted on the next seed. The withdrawal is per role, so a capability that
moved from one role to another leaves the role that lost it and stays with the role that gained it.
Workspace-scoped permission rows are not touched — they are the consumer's override, not the seed's.

Both dialects run one shared runner, `runAuthDialectConformance` from
`@chester-hill-solutions/auth/testing`, which asserts the `workspace` table's shape, that two
workspaces may share a slug, and that a product's own role set reaches the database with the ranks
it declared. A reviewer should not have to know to look in both siblings.

## Testing

`@chester-hill-solutions/auth-d1/testing` exports `createTestDb` / `withTestDb` — an
in-memory `bun:sqlite` database (no Miniflare/Workers runtime required) — plus `DDL` and
`SYSTEM_ROLES_SEED_DDL` fixtures that mirror the D1 migrations a real deployment would run.

```typescript
import { withTestDb } from "@chester-hill-solutions/auth-d1/testing";
import { DDL } from "@chester-hill-solutions/auth-d1/testing"; // or import from your own migrations
import { workspaces } from "@chester-hill-solutions/auth-d1/schema";

await withTestDb({ ddl: DDL, schema: { workspaces } }, async ({ db }) => {
  await db.insert(workspaces).values({ id: "ws-1", name: "Acme", slug: "acme" });
});
```

## Develop in this repo

```bash
bun run --cwd packages/auth-d1 test
bun run --cwd packages/auth-d1 typecheck
bun run --cwd packages/auth-d1 build
```

## Caveats / deviations from `auth-postgres`

- `redeemInvitation`'s idempotent-recovery path does an extra membership lookup on the
  "already accepted by this user" fast path (auth-postgres trusts its transaction and
  skips this). This is intentional — see "D1 transaction limits" above.
- `WORKSPACE_MEMBER_ROLE_ID_MIGRATION_DDL` (the Postgres `role` enum → `role_id` column
  migration) has no D1 equivalent here: this package ships `role_id` from day one, so
  there is no legacy column to migrate away from.
- `AUTH_USER_ID_TEXT_MIGRATION_DDL` (the Postgres `uuid` → `text` user-id migration) has no D1
  equivalent here either, for the same reason: this package's `user.id` is `text` from day one,
  because D1 has no native `uuid` type, so there is no legacy column to migrate away from.
- This package ships a `./testing` entry point that `auth-postgres` does not: D1 can be stood up
  in memory with `bun:sqlite`, so the test database helper travels with it. Postgres has no
  in-memory equivalent — its conformance suite runs against PGlite through the shared
  `@chester-hill-solutions/auth/testing` entry point instead.

Those four are the whole of the difference between this package's public surface and
`auth-postgres`'s. Everything else — the API-key subsystem and its `workspaceApiKeys` table, the
`DB` type, the OAuth tables and their DDL, the drizzle auth tables, `AUTH_DDL`,
`WORKSPACE_MEMBER_DDL` — is in both, in its own dialect.
- No Postgres RPC (`check_workspace_feature_permission`) — see "No Postgres RPC" above.

**This list is checked.** `scripts/check-sibling-parity.mjs` builds both packages, reads the
exported symbols of every entry point in their `exports` maps, and fails on any difference that
is not written down in `packages/auth-d1/sibling-deviations.json` — and on any entry in that file
that no longer describes a difference. A gap written down here and in that file is a gap with a
reason; a gap in either one alone is a failure.

## Related ADRs

- [ADR-0009](../../docs/adr/0009-workers-auth-path.md) — Workers auth path (Hyperdrive vs D1-native)

### Explicit invitation delegation

Pass `{ roles }` as the third argument to both `createInvitation` and `redeemInvitation`, using
exactly the product vocabulary supplied to `seedProductRoleCapabilityMatrix`. Missing vocabulary
fails closed with `INVITE_ROLE_VOCABULARY_REQUIRED`; a higher rank grants no invitation rights.
The inviter must still be a member and their current role's `invites` must include the target.
Redemption, including accepted-invitation recovery, rechecks the current vocabulary.

See [round-two security migration](../../docs/SECURITY-ROUND2-MIGRATION.md) before upgrading.
