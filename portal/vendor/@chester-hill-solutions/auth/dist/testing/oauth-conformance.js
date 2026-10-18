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
/**
 * Better Auth's field types as the drizzle `dataType` each has to become.
 *
 * `string[]` and `json` both land on `json`: they are stored as JSON text, and drizzle reports
 * `SQLiteTextJson` for both. Asserting the distinction here would be asserting a distinction drizzle
 * does not make.
 */
const DATA_TYPE_FOR_FIELD = {
    string: 'string',
    number: 'number',
    boolean: 'boolean',
    date: 'date',
    json: 'json',
    'string[]': 'json',
};
function assert(condition, message) {
    if (!condition)
        throw new Error(`oauth schema conformance: ${message}`);
}
/**
 * Assert that every model Better Auth resolves exists in the declaration, that every field it
 * expects is declared with the right type, nullability and uniqueness, and that the declaration
 * carries no property Better Auth does not know about.
 *
 * `id` is expected on every model and is not listed in Better Auth's `fields`, because the adapter
 * treats it as implicit. It is allowed here for the same reason.
 */
export function runOAuthSchemaConformance(schema) {
    const { name, expected, declared } = schema;
    for (const [model, expectedModel] of Object.entries(expected)) {
        const declaredModel = declared[model];
        assert(declaredModel, `${name}: no declaration for model ${model}`);
        const expectedProps = new Set([...Object.keys(expectedModel.fields), 'id']);
        for (const property of expectedProps) {
            assert(declaredModel[property], `${name}: ${model}.${property} is expected by Better Auth but is not declared`);
        }
        for (const property of Object.keys(declaredModel)) {
            assert(expectedProps.has(property), `${name}: ${model}.${property} is declared but Better Auth does not resolve a field by that name`);
        }
        for (const [property, field] of Object.entries(expectedModel.fields)) {
            const column = declaredModel[property];
            const where = `${name}: ${model}.${property}`;
            const wantType = DATA_TYPE_FOR_FIELD[field.type];
            assert(wantType, `${where} has Better Auth type ${field.type}, which this runner does not map`);
            assert(column.dataType === wantType, `${where} is declared as ${column.dataType} but Better Auth's ${field.type} needs ${wantType}`);
            assert(column.notNull === field.required, `${where} is declared notNull=${column.notNull} but Better Auth says required=${field.required}`);
            assert(column.unique === field.unique, `${where} is declared unique=${column.unique} but Better Auth says unique=${field.unique}`);
        }
    }
}
