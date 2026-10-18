/**
 * What both auth dialects must agree about, asserted once.
 *
 * `auth-d1` and `auth-postgres` are siblings: neither depends on the other, and both depend on
 * `auth`. A dialect fix landed in one and was never revisited in the other, so they disagreed
 * about the workspace table and about who decides what roles exist — and the second sibling's test
 * suite defended the wrong shape, so fixing the schema broke a suite that read as protection.
 *
 * A reviewer should not have to already know to look in both. So the agreement lives here, in the
 * package both depend on, and each dialect's test calls this runner with an adapter that can
 * describe its own schema and open a database.
 *
 * The runner throws rather than using a test framework, so this module carries no dependency on
 * one and a failure reads the same wherever it is caught. That is the pattern
 * `cms-store/testing`'s conformance runner already uses.
 *
 * **One database per run.** The first version of this took an `exec` that opened and closed a
 * database per statement, which meant four PGlite instances per dialect. Under a whole-suite run
 * that was enough to push an unrelated package's first test past its five-second timeout, and a
 * timed-out test leaves global state behind, so 59 failures appeared in `sparkshop-api` that had
 * nothing to do with auth. The session is opened once and reset between checks.
 */
import { type RoleDefinition } from '../product-roles.js';
/** A column as the dialect's own schema declares it. */
export type DeclaredColumn = {
    name: string;
    notNull: boolean;
    unique: boolean;
};
/** A database open for the length of one run. */
export type AuthDialectSession = {
    /** Applies one statement, returning the error text when the database refuses it. */
    exec: (statement: string) => Promise<{
        ok: true;
    } | {
        ok: false;
        error: string;
    }>;
    /** Seeds a product's role set and reads the ranks back, so the runner can check that the
     *  vocabulary which reached the database is the product's and not a constant in the package. */
    seedAndReadRanks: (roles: readonly RoleDefinition[]) => Promise<ReadonlyMap<string, number>>;
    /** Empties the tables the runner writes to, so ids do not collide between checks. */
    reset: () => Promise<void>;
    /** Releases the database. */
    close: () => Promise<void>;
};
/** What a dialect must provide to be checked against the other one. */
export type AuthDialectUnderTest = {
    /** For the failure message, for example `auth-d1`. */
    name: string;
    /** The `workspace` table's columns, read from the package's own schema declaration. */
    workspaceColumns: () => readonly DeclaredColumn[];
    /** Opens a fresh database. Called once per run. */
    open: () => Promise<AuthDialectSession>;
    /** The role set this dialect seeds when the product supplies none. */
    defaultProductRoles: () => readonly RoleDefinition[];
};
/**
 * A role set for a product that shares no vocabulary with the default one.
 *
 * No id here appears in `PRODUCT_ROLES`, so a package that still carried a closed tuple could not
 * seed them.
 */
export declare const FOREIGN_ROLE_SET: readonly RoleDefinition[];
/**
 * Run every check both dialects must pass.
 *
 * @param dialect the dialect under test, with its own schema and a way to open a database
 */
export declare function runAuthDialectConformance(dialect: AuthDialectUnderTest): Promise<void>;
