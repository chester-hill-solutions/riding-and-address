/**
 * `@chester-hill-solutions/auth/testing` — what both auth dialects must agree about.
 *
 * `auth-d1` and `auth-postgres` are siblings, so neither can check the other. This is the shared
 * package, so the agreement is asserted here and each dialect calls it.
 */
export { FOREIGN_ROLE_SET, runAuthDialectConformance, } from './auth-conformance.js';
export { runOAuthSchemaConformance, } from './oauth-conformance.js';
