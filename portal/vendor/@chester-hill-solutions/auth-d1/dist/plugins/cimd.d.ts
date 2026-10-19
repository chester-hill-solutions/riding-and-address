/**
 * Client ID Metadata Document support, behind its own subpath because `@better-auth/cimd` is an
 * optional peer. Importing this module is what requires that package.
 *
 * CIMD is what the MCP 2026-07-28 profile prefers over dynamic client registration: the `client_id`
 * is an HTTPS URL whose document describes the client. A resource server that fetches it should read
 * `src/cimd-fetch.ts` in riding-and-address for the transport requirements, and ADR 0010 there for
 * the one requirement a Worker cannot meet.
 */
export { cimd } from "@better-auth/cimd";
export type CimdOptions = Parameters<typeof import("@better-auth/cimd").cimd>[0];
