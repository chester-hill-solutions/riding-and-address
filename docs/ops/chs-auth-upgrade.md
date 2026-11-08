# CHS auth refresh: host contracts and rollout

The [vendored auth packages](../../portal/vendor/README.md) use the immutable CHS 3dba6c5 build. Directory delivery and all existing external versions remain in place. Run the native provenance/closure gate after a frozen install; the build's vendor path aliases must not hide a missing installed dependency.

## Product policy

A Customer remains a workspace. Owners and admins may invite members; members invite nobody. [product-roles.ts](../../portal/app/lib/product-roles.ts) declares exactly those three IDs and that existing delegation policy for both create and redeem. Owner/admin ranks share one tier because the portal gives them the same invitation rights. No caller role or feature-capability seed is introduced.

Request-scoped D1, UUID IDs, existing email/password/session behavior, OAuth customer claims/session-liveness policy, hashed Server keys, Browser-key origin allowlists and billing/usage rules are retained. New SDK API-key helpers are not adopted by the product. The [existing CIMD transport decision](../adr/0010-mcp-client-registration-cimd.md) remains; its redirect description now matches the implemented manual/3xx refusal.

## Public origin

Keep the existing BASE_URL or BETTER_AUTH_URL. Deployed runtimes must supply an HTTP(S) origin without credentials, path, query or fragment. Both settings, if present, must agree after normalization. Missing/conflicting settings fail closed; a request Host header cannot supply the authority. The existing localhost fallback remains only for unconfigured development runtimes. Public API host aliases and trusted-origin policy remain separate.

Check custom-domain settings before rollout, retain the fixed auth secret, and keep Origin/CSRF checks enabled. The actual-Worker smoke verifies cookie sessions, scoped invitations and forged-origin refusal.

## Membership index

[0003_workspace_member_uniqueness.sql](../../portal/migrations/0003_workspace_member_uniqueness.sql) follows the normal portal migration workflow. It adds the index required by the new redemption upsert and prevents multiple effective roles for the same Customer/user pair. It never picks a winner or deletes membership rows.

Before rollout, review the duplicate preflight against the intended database:

```sql
SELECT workspace_id, user_id, count(*) AS membership_count
FROM workspace_member
GROUP BY workspace_id, user_id
HAVING count(*) > 1;
```

If rows appear, resolve their ownership/role from authoritative product records with operator approval and a database backup. Do not delete one blindly or broaden grants. The migration refuses duplicates through unique-index enforcement; a failure stops the deployment before new code is shipped. Existing per-user memberships in different Customers remain valid.

Use the repository's normal migration status/apply commands documented in [portal/README.md](../../portal/README.md). CI's production workflow already applies migrations before deployment. This consumer task executed only temporary local fixture migrations, never a remote D1 command.

For rollback, preserve the uniqueness invariant and validate the previous invitation path before restoring older code; do not drop the index to bypass a failed grant.

## Validation

Run root lint/typecheck/billing, secret/cycle and coverage gates, portal typecheck/coverage, the production build, `check:chs-packages`, and `test:runtime`. The runtime fixture uses only temporary local D1/KV and synthetic credentials. It exercises owner/admin-to-member invitations, stored Customer scope, token binding/replay refusal, unauthorized member delegation and cross-origin writes alongside existing uploads and webhook checks.

The membership migration regression checks the legacy schema, duplicate refusal without data loss, repeat execution and cross-Customer uniqueness. The UI component copies and CanCoder theme remain app-owned and unchanged.
