/**
 * DDL for the tables a product needs from this package, other than its tenancy.
 *
 * ## There is no `workspace` here
 *
 * **A workspace is the product's tenancy, and its shape is the product's business.** This
 * package requires exactly what authorisation needs — `workspace(id)` — and leaves the rest
 * to the consumer: the `workspaces` table in the drizzle schema keeps `name` and `slug` as
 * nullable columns, so a product that has them keeps them and one that does not is not
 * blocked.
 *
 * The test harness is *generous* where the package is not, because the tests exercise a
 * product that does have a name and a slug for its workspaces. The harness creates the
 * `workspace` table; this DDL does not. Optional there, required here — the two are not
 * the same claim, and the difference is the point.
 *
 * ## `workspace_member` is here because it is the package's
 *
 * It is the join between the consumer's tenancy and this package's users and roles, so
 * nobody else can own it. It references `workspace(id)`, which the consumer must have
 * created — and the order is the consumer's to get right, which is stated here rather than
 * left to be discovered from a foreign-key error.
 *
 * The sibling is `auth-postgres/src/workspace-member-sql.ts`, and the two declare the same
 * table in two dialects. Only the spelling of the types differs: the Postgres one stores
 * `created_at` as a timestamp, this one as integer milliseconds, because that is what D1
 * holds.
 */
export declare const WORKSPACE_MEMBER_DDL = "\nCREATE TABLE IF NOT EXISTS \"workspace_member\" (\n  \"id\" text PRIMARY KEY NOT NULL,\n  \"workspace_id\" text NOT NULL REFERENCES \"workspace\"(\"id\") ON DELETE CASCADE,\n  \"user_id\" text NOT NULL,\n  \"role_id\" text NOT NULL,\n  \"invited_by\" text,\n  \"created_at\" integer NOT NULL DEFAULT (unixepoch() * 1000)\n);\n";
