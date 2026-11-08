/**
 * The public origin of the application.
 *
 * The `app-origin` package owns these functions, and it holds the behaviour
 * cases for them. This module keeps the subpath of the auth package, so every
 * consumer of it keeps working.
 */
export { absoluteAppUrl, appPublicOrigin, authTrustedOrigins, MissingPublicOriginError, } from "@chester-hill-solutions/app-origin";
