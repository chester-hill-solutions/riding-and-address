/**
 * The UCP (Universal Commerce Protocol) business profile served at `/.well-known/ucp`.
 *
 * CanCoder advertises exactly one thing: an MCP transport binding. It implements no UCP
 * commerce capability and has no live payment handler, so `capabilities` is omitted and
 * `payment_handlers` is empty. Both registries that UCP requires are still emitted, because
 * the schema demands their presence even when empty. Publishing only live facts is the
 * point of this document — see `docs/ops/agent-first-product-plan.md` (W3) and
 * `docs/ops/agent-discovery.md`.
 *
 * The service entry deliberately carries no `schema`. A UCP service `schema` is
 * authority-bound: its URL host must reverse-match the service namespace, so it could only
 * be served from the canonical `cancoder.chesterhillsolutions.ca` domain and never from the
 * `*.workers.dev` host (a public suffix). Omitting it keeps the profile consistent on every
 * configured host. Add it once an authority-bound OpenRPC document is published.
 *
 * Spec: https://ucp.dev/specification/overview/ (release 2026-08-25).
 */

/** The namespace CanCoder owns: reverse of `chesterhillsolutions.ca`, plus the service name. */
export const UCP_SERVICE_NAME = 'ca.chesterhillsolutions.cancoder';

/** The UCP protocol release this profile targets. */
export const UCP_PROTOCOL_VERSION = '2026-08-25';

export interface UcpServiceBinding {
  version: string;
  spec: string;
  transport: 'rest' | 'mcp' | 'a2a' | 'embedded';
  endpoint: string;
}

export interface UcpProfile {
  ucp: {
    version: string;
    services: Record<string, UcpServiceBinding[]>;
    payment_handlers: Record<string, UcpServiceBinding[]>;
  };
}

/**
 * Build the business profile for the host that served it. `origin` is host-derived so the
 * MCP endpoint and setup notes resolve against the same hostname the agent discovered, per
 * `docs/ops/agent-first-product-plan.md` ("keep discovery resources on the same host").
 */
export function createUcpProfile(origin: string): UcpProfile {
  return {
    ucp: {
      version: UCP_PROTOCOL_VERSION,
      services: {
        [UCP_SERVICE_NAME]: [
          {
            version: UCP_PROTOCOL_VERSION,
            spec: `${origin}/docs/agents.md`,
            transport: 'mcp',
            endpoint: `${origin}/mcp`,
          },
        ],
      },
      payment_handlers: {},
    },
  };
}
