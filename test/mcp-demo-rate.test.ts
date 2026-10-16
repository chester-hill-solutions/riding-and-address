import { describe, it, expect } from 'vitest';
import { getAgentQuickstart } from '../src/mcp';
import { createOpenAPISpec } from '../src/docs';
import { DEFAULT_DEMO_RATE_LIMIT } from '../src/utils';

/**
 * The keyless demo throttle is quoted to agents in more than one place — the agent quickstart and
 * the OpenAPI demo note (and the MCP tool text, which is built at request time). The gate
 * (`scripts/check-billing-invariants.mjs`) forbids restating the number as a literal; these prove
 * the value is actually interpolated, so the number an agent is told cannot drift from the number
 * the Worker enforces via `DEFAULT_DEMO_RATE_LIMIT`.
 */
describe('demo throttle is quoted from one constant', () => {
  it('names the constant value in the agent quickstart', () => {
    expect(getAgentQuickstart('https://lookup.test')).toContain(
      `${DEFAULT_DEMO_RATE_LIMIT} requests per minute per IP`
    );
  });

  it('names the constant value in the OpenAPI demo note', () => {
    const spec = createOpenAPISpec('https://lookup.test') as unknown as {
      paths: Record<string, { get: { description?: string } }>;
    };
    const description = String(spec.paths['/api/demo/federal'].get.description);
    expect(description).toContain(`default ${DEFAULT_DEMO_RATE_LIMIT}`);
  });
});
