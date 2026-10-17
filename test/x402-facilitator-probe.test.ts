import { describe, it, expect } from 'vitest';
import { classifyVerifyProbe, summariseSupported } from '../scripts/lib/x402-facilitator-probe';

/**
 * The facilitator probe closes security review item 3, so its own judgement has to be trustworthy:
 * the dangerous failure is calling a wrong envelope "accepted". Every unclear answer must come back
 * inconclusive, never a pass.
 */

describe('classifyVerifyProbe', () => {
  it('reads a semantic rejection as an accepted envelope', () => {
    // The facilitator parsed our fields and judged the payment — which is exactly the confirmation
    // an unsigned payload can give.
    const verdict = classifyVerifyProbe(200, { isValid: false, invalidReason: 'invalid_signature' });
    expect(verdict.shape).toBe('envelope-accepted');
  });

  it('reads a shape complaint as a rejected envelope', () => {
    const verdict = classifyVerifyProbe(400, { error: 'paymentRequirements.network is required' });
    expect(verdict.shape).toBe('envelope-rejected');
  });

  it('prefers the semantic reading when a 400 mentions both', () => {
    // "invalid signature" contains "invalid"; a naive schema match would misread it as our fault.
    const verdict = classifyVerifyProbe(422, { error: 'authorization signature could not be verified' });
    expect(verdict.shape).toBe('envelope-accepted');
  });

  it('never calls an unclear answer accepted', () => {
    expect(classifyVerifyProbe(500, 'internal error').shape).toBe('inconclusive');
    expect(classifyVerifyProbe(200, { unexpected: true }).shape).toBe('inconclusive');
    expect(classifyVerifyProbe(400, 'nope').shape).toBe('inconclusive');
    expect(classifyVerifyProbe(403, 'forbidden').shape).toBe('inconclusive');
  });

  it('distinguishes a missing endpoint from a rejected envelope', () => {
    // These need different fixes: one is the URL, the other is the contract.
    expect(classifyVerifyProbe(404, 'not found').shape).toBe('endpoint-missing');
    expect(classifyVerifyProbe(405, 'method not allowed').shape).toBe('endpoint-missing');
  });

  it('reports an unreachable facilitator as such', () => {
    expect(classifyVerifyProbe(0, 'ECONNREFUSED').shape).toBe('unreachable');
  });

  it('treats a verified payload as an accepted envelope, not as proof of settlement', () => {
    expect(classifyVerifyProbe(200, { isValid: true }).shape).toBe('envelope-accepted');
  });
});

describe('summariseSupported', () => {
  const config = { network: 'eip155:84532', asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' };

  it('reports a listed network and asset', () => {
    const summary = summariseSupported(
      { kinds: [{ network: config.network, extra: { asset: config.asset } }] },
      config
    );
    expect(summary.reachable).toBe(true);
    expect(summary.listsNetwork).toBe(true);
    expect(summary.listsAsset).toBe(true);
  });

  it('flags a configured network the facilitator does not list', () => {
    const summary = summariseSupported({ kinds: [{ network: 'eip155:1' }] }, config);
    expect(summary.listsNetwork).toBe(false);
  });

  it('says "cannot tell" rather than "unsupported" when the shape is unfamiliar', () => {
    // A false negative here would send someone chasing a non-problem.
    const summary = summariseSupported({ something: 'else' }, config);
    expect(summary.listsNetwork).toBeNull();
  });

  it('reports an absent /supported without claiming anything about support', () => {
    const summary = summariseSupported(null, config);
    expect(summary.reachable).toBe(false);
    expect(summary.listsNetwork).toBeNull();
  });
});
