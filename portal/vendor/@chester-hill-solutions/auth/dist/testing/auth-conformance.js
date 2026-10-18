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
import { assertProductRoles } from '../product-roles.js';
function assert(condition, message) {
    if (!condition)
        throw new Error(`auth dialect conformance: ${message}`);
}
function columnMap(columns) {
    return new Map(columns.map((column) => [column.name, column]));
}
function describe(columns) {
    return columns
        .map((column) => `${column.name}${column.notNull ? ' NOT NULL' : ''}${column.unique ? ' UNIQUE' : ''}`)
        .join(', ');
}
/**
 * A role set for a product that shares no vocabulary with the default one.
 *
 * No id here appears in `PRODUCT_ROLES`, so a package that still carried a closed tuple could not
 * seed them.
 */
export const FOREIGN_ROLE_SET = [
    { id: 'org-admin', rank: 9, invites: ['org-member'] },
    { id: 'org-member', rank: 4, invites: [] },
];
/**
 * Run every check both dialects must pass.
 *
 * @param dialect the dialect under test, with its own schema and a way to open a database
 */
export async function runAuthDialectConformance(dialect) {
    const columns = dialect.workspaceColumns();
    checkWorkspaceShape(dialect.name, columns);
    checkDefaultRoleSetIsCoherent(dialect);
    const session = await dialect.open();
    try {
        await checkSlugMayRepeat(dialect.name, session);
        await checkProductRoleSetIsSeeded(dialect.name, session);
    }
    finally {
        await session.close();
    }
}
/**
 * The `workspace` table declares the same columns, with the same constraints, in both dialects.
 *
 * This package requires `workspace(id)` and nothing more, because the consumer owns its tenancy.
 * So `name` and `slug` are optional here, and a dialect that made them required would be claiming
 * something the package does not promise — while a dialect that made `slug` unique would be
 * promising that two workspaces cannot share one, which is not true either.
 */
function checkWorkspaceShape(name, columns) {
    const byName = columnMap(columns);
    for (const required of ['id', 'name', 'slug', 'created_at', 'updated_at']) {
        assert(byName.has(required), `${name} workspace table has no ${required} column`);
    }
    const id = byName.get('id');
    assert(id?.notNull === true, `${name} workspace.id must be NOT NULL, got ${describe(columns)}`);
    for (const optional of ['name', 'slug']) {
        const column = byName.get(optional);
        assert(column?.notNull === false, `${name} workspace.${optional} must be nullable; the consumer owns its tenancy. Got ${describe(columns)}`);
    }
    // The declaration as well as the behaviour. A dialect can declare `unique` while its migration
    // does not, so `checkSlugMayRepeat` would still pass on a schema promising more than it
    // enforces. Both are asserted, because they are different claims.
    const slug = byName.get('slug');
    assert(slug?.unique === false, `${name} workspace.slug must not be declared unique; two workspaces may share one. Got ${describe(columns)}`);
}
/**
 * Two workspaces may share a slug.
 *
 * Asserted by asking the database, not by reading the schema. A declaration can say one thing and
 * a migration another, and the assertion that matters is the behaviour.
 */
async function checkSlugMayRepeat(name, session) {
    await session.reset();
    const slug = 'conformance-shared-slug';
    const first = await session.exec(`INSERT INTO workspace (id, name, slug) VALUES ('conformance-ws-1', 'One', '${slug}')`);
    assert(first.ok, `${name} refused the first workspace: ${first.ok ? '' : first.error}`);
    const second = await session.exec(`INSERT INTO workspace (id, name, slug) VALUES ('conformance-ws-2', 'Two', '${slug}')`);
    assert(second.ok, `${name} refused a second workspace with the same slug. Two workspaces sharing a slug is allowed: ` +
        `the slug is optional and consumer-owned, and this package requires workspace(id) and nothing more. ` +
        `Got: ${second.ok ? '' : second.error}`);
}
/** The default role set is coherent, or a caller who supplies nothing seeds a hierarchy that cannot work. */
function checkDefaultRoleSetIsCoherent(dialect) {
    const roles = dialect.defaultProductRoles();
    assert(roles.length > 0, `${dialect.name} exposes no default role set`);
    assertProductRoles(roles);
}
/**
 * A product's own role set is what reaches the database, with the ranks the product gave.
 *
 * The ranks read back must equal the ranks declared. A rank written by the package rather than by
 * the product is a second source of truth for a vocabulary the product owns.
 */
async function checkProductRoleSetIsSeeded(name, session) {
    await session.reset();
    const ranks = await session.seedAndReadRanks(FOREIGN_ROLE_SET);
    for (const role of FOREIGN_ROLE_SET) {
        assert(ranks.has(role.id), `${name} did not seed the product's role ${role.id}. Seeded: [${[...ranks.keys()].join(', ')}]`);
        assert(ranks.get(role.id) === role.rank, `${name} seeded ${role.id} with rank ${ranks.get(role.id)}, but the product declared ${role.rank}`);
    }
}
