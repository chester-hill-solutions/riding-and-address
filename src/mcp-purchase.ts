/**
 * Getting a *human* to pay, from inside MCP.
 *
 * The x402 rail is autonomous: an agent with a wallet pays at `POST /api/quote/accept` and never
 * needs a person. That leaves the larger population — someone in Claude, VS Code or Cursor whose
 * agent hit a paid operation — with no way to be asked. MCP defines one: a **URL-mode elicitation**,
 * which the spec requires for anything involving payment credentials ("servers MUST NOT use form mode
 * elicitation to request ... payment credentials").
 *
 * This module is the hand-off, and deliberately nothing more. The tool tells the client "a human is
 * needed, here"; the human does whatever they need to do at a page we serve; and on re-entry the
 * server reports the caller's *actual* account state. It never takes the client's word for what
 * happened — the response says a human was shown a page, not that money moved. That is the same
 * discipline the x402 path uses, where the facilitator's answer is the evidence and the caller's is
 * not.
 *
 * Design: `docs/plans/mcp-payment-elicitation.md`.
 */

import { createRequestStateCodec } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { KeyAuthResult } from './api-keys';

/** The key this flow's input request and response are carried under. */
export const PURCHASE_INPUT_KEY = 'purchase';

/**
 * What the signed `requestState` carries. Signed, not encrypted — the client can decode it — so it
 * holds no secrets and nothing that grants anything. It exists to correlate the round trip, not to
 * authorise one.
 */
export const PurchaseRequestStateSchema = z.object({
  correlationId: z.string(),
});
export type PurchaseRequestState = z.infer<typeof PurchaseRequestStateSchema>;

/** How long a human has to complete the hand-off before the round trip is refused. */
export const PURCHASE_TTL_SECONDS = 600;

/**
 * The page that helps this caller. An anonymous caller needs an account and a key; an authenticated
 * one already has both, so the useful page is where their keys live.
 *
 * Built from the request origin, never from input, so the client can only ever be sent somewhere we
 * serve.
 */
export function purchaseUrl(origin: string, authenticated: boolean): string {
  return authenticated ? `${origin}/app/keys` : `${origin}/signup`;
}

/** What the human is being asked to do, in the client's own dialog. */
export function purchaseMessage(authenticated: boolean): string {
  return authenticated
    ? 'CanCoder needs a payment method on your account to continue. Open your CanCoder keys page to ' +
        'add one, then retry. Nothing has been charged.'
    : 'CanCoder needs a CanCoder account and a Server API key to continue. Open the sign-up page to ' +
        'create one (there is a free monthly allowance), then retry. Nothing has been charged.';
}

/**
 * The HMAC codec for `requestState`, or null when the deployment cannot support the flow.
 *
 * Returns null rather than throwing when the secret is missing or shorter than the 256 bits the
 * codec requires: a misconfigured signing secret must not be able to take down `lookup_riding`. The
 * tool reports the hand-off as unavailable instead.
 */
export function createPurchaseCodec(secret: string | undefined) {
  if (!secret || new TextEncoder().encode(secret).length < 32) return null;
  return createRequestStateCodec<PurchaseRequestState>({
    key: secret,
    ttlSeconds: PURCHASE_TTL_SECONDS,
    // The spec's user-binding MUST for state that influences authorisation. This state authorises
    // nothing, so the binding is defence in depth rather than the control — but it is free.
    bind: (ctx) => ctx.mcpReq.method,
  });
}

export type PurchaseCodec = NonNullable<ReturnType<typeof createPurchaseCodec>>;

/**
 * What the caller's account actually looks like now, read from the server rather than from anything
 * the client said. This is the whole point of the re-entry: the response proves a page was opened,
 * and this proves whether anything changed.
 */
export function accountSummary(auth: KeyAuthResult | null): {
  authenticated: boolean;
  summary: string;
} {
  if (!auth || !auth.ok) {
    return {
      authenticated: false,
      summary:
        'No CanCoder Server API key is attached to this session, so calls remain on the keyless demo tier.',
    };
  }
  return {
    authenticated: true,
    summary: auth.customer?.id
      ? `Authenticated with a Server API key for customer ${auth.customer.id}.`
      : 'Authenticated with a Server API key.',
  };
}
