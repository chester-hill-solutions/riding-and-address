# @chester-hill-solutions/auth

Framework-agnostic auth utilities: safe redirects, cookies, origin config, and session types.

**Install:** [docs/USING-PACKAGES.md](../../docs/USING-PACKAGES.md)

```bash
bun add @chester-hill-solutions/auth@^0.14.0
```

**Peers:** `cookie` (required), `postgres` (optional, for `postgres` subpath).

Lockstep version with `auth-postgres` and `auth-react-router`.

## Example

```typescript
import { safePostLoginRedirectPath } from "@chester-hill-solutions/auth/redirect";
import { mergeSetCookieHeaders } from "@chester-hill-solutions/auth/cookies";
import { appPublicOrigin, authTrustedOrigins } from "@chester-hill-solutions/auth/origin";
```

## Subpath exports

| Import | Purpose |
|--------|---------|
| `@chester-hill-solutions/auth/redirect` | Post-login redirect safety |
| `@chester-hill-solutions/auth/cookies` | Set-Cookie merging |
| `@chester-hill-solutions/auth/origin` | `APP_PUBLIC_ORIGIN`, trusted origins. The `app-origin` package owns these functions, and it holds the behaviour cases for them. This subpath serves them |
| `@chester-hill-solutions/auth/resource` | Resource-oriented auth responses |
| `@chester-hill-solutions/auth/postgres` | Postgres actor helpers |
| `@chester-hill-solutions/auth/testing` | `runAuthDialectConformance`, `runOAuthSchemaConformance` and `oauthPluginModels`, the agreement both auth dialects must meet |

## Where roles come from (0.3.0+)

**The product owns them.** A role is `{ id, rank, invites }`, and a product passes its own set to
`seedProductRoleCapabilityMatrix` in either dialect. The rank that reaches the database, and the
roles a member may invite, are both read from that set. Neither dialect holds a ranking.

This module is where the vocabulary lives, and both `auth-d1` and `auth-postgres` re-export it, so
the two siblings cannot disagree about who decides what roles exist. A dialect fix had landed in
one and never been revisited in the other.

`PRODUCT_ROLES` is a **default** for a caller that has not declared a set, not the vocabulary. Its
ids (`owner`, `admin`, `member`, `caller`) come from a voice product; a product that seeds them
without asking is writing a lie into its own data, and every later reader of that column inherits
it. The set used to be a closed tuple, which made adding a role a compile error, and that
compile-time completeness is now replaced by `assertProductRoles`, which rejects a hierarchy where a
role invites one of equal or higher rank before any row is written.

**Env:** `APP_PUBLIC_ORIGIN`, `APP_TRUSTED_ORIGINS`

## Develop in this repo

```bash
bun run --cwd packages/auth test
bun run --cwd packages/auth build
```

## Capability actors & tokens (0.2.0+)

- `AuthorizationActor` / `CapabilityId` — product-agnostic session and API-key actor contracts
- `normalizeEmail`, opaque token `generate` / `hash` / `verify` (constant-time)
- `CapabilityDeniedError`, `AuthzError` vocabulary

Product apps define their own capability ID allowlists; this package does not ship CallCaster IDs.
