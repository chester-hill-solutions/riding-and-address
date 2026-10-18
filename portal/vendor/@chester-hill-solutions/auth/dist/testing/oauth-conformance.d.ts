/**
 * What the OAuth tables must be, checked against what a dialect declares.
 *
 * The OAuth provider's schema is not ours to invent: Better Auth resolves it from the installed
 * plugins, and the drizzle adapter matches fields to columns **by property name**. A declaration
 * that is missing a field, or gets its nullability or type wrong, fails at request time — during an
 * authorization, or a token refresh — rather than at compile time. Nothing in the type system
 * connects a drizzle table to the plugin that will query it.
 *
 * So the assertion runs the other way round from the usual one: the *expected* shape is derived
 * from Better Auth's own resolved schema (`auth.$context.tables`) by the caller, and this compares
 * the dialect's declaration against it. `auth-d1` and `auth-postgres` are siblings and neither can
 * check the other, so the comparison lives here and each dialect supplies its own two halves.
 *
 * The runner deliberately takes plain data rather than importing Better Auth: this package is
 * runtime-neutral and `better-auth` is a peer of the adapters, not a dependency of the core.
 *
 * **Known limit, and where it is covered instead.** Foreign keys are not asserted *here*: drizzle
 * 0.45 exposes a column's `dataType`, `notNull` and `isUnique`, but not its reference target
 * through any public accessor — measured, not assumed. They are asserted one layer down, where it
 * counts: the dialect's DDL test reads `PRAGMA foreign_key_list` back out of a real database and
 * compares it to Better Auth's declared references. Since the DDL is what a deployment provisions,
 * a wrong foreign key fails there. Everything about a field that is readable here is checked here.
 */
/** A field as Better Auth declares it. */
export type ExpectedOAuthField = {
    /** `string`, `number`, `boolean`, `date`, `json` or `string[]`. */
    type: string;
    required: boolean;
    unique: boolean;
};
export type ExpectedOAuthModel = {
    fields: Record<string, ExpectedOAuthField>;
};
/** A column as the dialect's own drizzle table declares it. */
export type DeclaredOAuthColumn = {
    /** The drizzle property name — the thing the adapter matches a Better Auth field against. */
    property: string;
    /** drizzle's `column.dataType`: `string`, `number`, `boolean`, `date` or `json`. */
    dataType: string;
    notNull: boolean;
    unique: boolean;
};
export type OAuthSchemaUnderTest = {
    /** For the failure message, for example `auth-d1`. */
    name: string;
    /** Derived by the caller from Better Auth's resolved schema. */
    expected: Record<string, ExpectedOAuthModel>;
    /** Read from the package's own declarations, keyed by model then property name. */
    declared: Record<string, Record<string, DeclaredOAuthColumn>>;
};
/**
 * Assert that every model Better Auth resolves exists in the declaration, that every field it
 * expects is declared with the right type, nullability and uniqueness, and that the declaration
 * carries no property Better Auth does not know about.
 *
 * `id` is expected on every model and is not listed in Better Auth's `fields`, because the adapter
 * treats it as implicit. It is allowed here for the same reason.
 */
export declare function runOAuthSchemaConformance(schema: OAuthSchemaUnderTest): void;
