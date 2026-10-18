/**
 * x402 (v2) — the account-free payment rail (ADR 0007, plan W6).
 *
 * The flow is the protocol's: a resource answers `402` with a `PAYMENT-REQUIRED` header carrying the
 * payment requirements; the client retries with a `PAYMENT-SIGNATURE` header carrying a signed
 * payment payload; the resource verifies and settles it — here by delegating to a facilitator's
 * `/verify` and `/settle` — and answers with a `PAYMENT-RESPONSE` header carrying the settlement
 * response.
 *
 * CanCoder never holds funds and never authorizes spending: the payer's wallet does, via the
 * signature in the payload. This module builds the requirements and talks to the facilitator; it
 * decides nothing about price, which comes from the signed offer.
 *
 * Everything is off unless `X402_ENABLED` is set and the rail is fully configured — an unconfigured
 * rail must never present payment requirements it cannot honour.
 */

import type { Env } from './types';
import type { Offer } from './offers';

/** x402 wire version this module speaks. */
export const X402_VERSION = 2;

export const PAYMENT_REQUIRED_HEADER = 'PAYMENT-REQUIRED';
export const PAYMENT_SIGNATURE_HEADER = 'PAYMENT-SIGNATURE';
export const PAYMENT_RESPONSE_HEADER = 'PAYMENT-RESPONSE';

export interface X402Config {
  payTo: string;
  network: string;
  asset: string;
  assetDecimals: number;
  assetName: string;
  assetVersion: string;
  maxTimeoutSeconds: number;
  facilitatorUrl: string;
  facilitatorToken?: string;
}

/**
 * Read the rail's configuration, or null when it is disabled or incomplete. Callers treat null as
 * "payments unavailable" and fail closed.
 */
export function x402ConfigFromEnv(env: Env): X402Config | null {
  if (env.X402_ENABLED !== 'true' && env.X402_ENABLED !== '1') return null;
  if (!env.X402_PAY_TO || !env.X402_NETWORK || !env.X402_ASSET || !env.X402_FACILITATOR_URL) {
    return null;
  }
  return {
    payTo: env.X402_PAY_TO,
    network: env.X402_NETWORK,
    asset: env.X402_ASSET,
    assetDecimals: Number(env.X402_ASSET_DECIMALS ?? '6'),
    assetName: env.X402_ASSET_NAME ?? 'USDC',
    assetVersion: env.X402_ASSET_VERSION ?? '2',
    maxTimeoutSeconds: Number(env.X402_MAX_TIMEOUT_SECONDS ?? '60'),
    facilitatorUrl: env.X402_FACILITATOR_URL.replace(/\/+$/, ''),
    facilitatorToken: env.X402_FACILITATOR_TOKEN,
  };
}

export interface PaymentRequirements {
  scheme: 'exact';
  network: string;
  /** Amount in the asset's minor units, as a decimal string. */
  amount: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra: { name: string; version: string };
}

/**
 * Service metadata for a discovery catalogue (the x402 Bazaar). All optional: a facilitator soft-drops
 * a field that fails its validation rules and keeps the rest.
 */
export interface PaymentResourceInfo {
  url: string;
  description: string;
  mimeType: string;
  /** Human-readable name, ≤ 32 printable ASCII characters. */
  serviceName?: string;
  /** Up to five short topical tags, each ≤ 32 printable ASCII characters. */
  tags?: string[];
}

/**
 * The Bazaar discovery extension. Declaring it is what makes a paid endpoint findable, and it is
 * catalogued only when a *client* echoes it back inside its payment payload — the official SDKs do
 * that automatically, which is why `@x402/fetch` sends an `extensions` key.
 *
 * `info.input.type` and `info.output.type` are required when the block is present; a declaration
 * missing them is dropped by the facilitator even when settlement succeeds.
 */
export interface PaymentExtensions {
  bazaar: {
    info: {
      input: { type: 'http'; method: string; queryParams?: Record<string, string> };
      output: { type: 'json'; example: unknown };
    };
  };
}

export interface PaymentRequired {
  x402Version: number;
  error?: string;
  resource: PaymentResourceInfo;
  accepts: PaymentRequirements[];
  extensions?: PaymentExtensions;
}

/** USD to the asset's minor units, as a string. `0.005` at 6 decimals → `"5000"`. */
export function toMinorUnits(amountUsd: number, decimals: number): string {
  const scaled = Math.round(amountUsd * 10 ** decimals);
  return String(scaled);
}

/**
 * The `PAYMENT-REQUIRED` body for an offer. The amount is the offer's own price ceiling, so a
 * requirements set can never ask for more than the caller accepted.
 */
/** A small, honest illustration of what a buyer receives, for the discovery catalogue. */
function outputExample(offer: Offer): unknown {
  return offer.operation === 'lookup.point'
    ? { riding: 'Ottawa Centre', datasetId: offer.scope.datasetId, datasetYear: offer.scope.datasetYear }
    : { records: [{ civicNumber: '100', streetName: 'Wellington', city: 'Ottawa', province: 'ON' }] };
}

export function buildPaymentRequired(
  config: X402Config,
  offer: Offer,
  resourceUrl: string
): PaymentRequired {
  return {
    x402Version: X402_VERSION,
    resource: {
      url: resourceUrl,
      description: `CanCoder ${offer.operation}`,
      mimeType: 'application/json',
      serviceName: 'CanCoder',
      tags: ['canada', 'address', 'electoral-district', 'geocoding'],
    },
    // The Bazaar declaration. It describes the paid endpoint an agent reaches after paying, not the
    // quote it came from — the offer id is deliberately absent, since it is per-offer and short-lived
    // and would put a signed token in a public catalogue.
    extensions: {
      bazaar: {
        info: {
          input: { type: 'http', method: 'POST' },
          output: { type: 'json', example: outputExample(offer) },
        },
      },
    },
    accepts: [
      {
        scheme: 'exact',
        network: config.network,
        amount: toMinorUnits(offer.price.maximum, config.assetDecimals),
        asset: config.asset,
        payTo: config.payTo,
        maxTimeoutSeconds: config.maxTimeoutSeconds,
        extra: { name: config.assetName, version: config.assetVersion },
      },
    ],
  };
}

export interface VerificationResult {
  isValid: boolean;
  invalidReason?: string;
}

export interface SettlementResponse {
  success: boolean;
  /** Broadcast transaction hash, present even when confirmation is pending. */
  transaction?: string;
  network?: string;
  errorReason?: string;
  /** Non-terminal: the transaction may still confirm; reconcile before retrying. */
  pending?: boolean;
}

export interface PaymentFacilitator {
  verify(paymentPayload: unknown, paymentRequirements: PaymentRequirements): Promise<VerificationResult>;
  settle(paymentPayload: unknown, paymentRequirements: PaymentRequirements): Promise<SettlementResponse>;
}

/**
 * Facilitator over HTTP: `/verify` then `/settle`, per the x402 facilitator contract.
 *
 * Verified against live testnet facilitators (see `docs/ops/x402-facilitator-verification.md`), which
 * is how the body's top-level `x402Version` was found to be required: without it a facilitator answers
 * `unsupported_scheme` and this class throws, surfacing as a bare 502. The response field names match
 * the v2 contract, including `invalidReason` and `payer`.
 */
export class HttpFacilitator implements PaymentFacilitator {
  constructor(private config: X402Config) {}

  private async post(path: string, body: unknown): Promise<Record<string, unknown>> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (this.config.facilitatorToken) {
      headers.Authorization = `Bearer ${this.config.facilitatorToken}`;
    }
    const response = await fetch(`${this.config.facilitatorUrl}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      // Include what the facilitator said. Without it a 400 is indistinguishable from any other
      // failure in the logs, which is exactly how the missing `x402Version` below stayed hidden:
      // the facilitator answered `unsupported_scheme`, and that reached the caller as a bare 502.
      const detail = await response.text().catch(() => '');
      throw new Error(
        `Facilitator ${path} returned ${response.status}${detail ? `: ${detail.slice(0, 300)}` : ''}`
      );
    }
    return (await response.json()) as Record<string, unknown>;
  }

  async verify(
    paymentPayload: unknown,
    paymentRequirements: PaymentRequirements
  ): Promise<VerificationResult> {
    const body = await this.post('/verify', {
      x402Version: X402_VERSION,
      paymentPayload,
      paymentRequirements,
    });
    return {
      isValid: body.isValid === true,
      invalidReason: typeof body.invalidReason === 'string' ? body.invalidReason : undefined,
    };
  }

  async settle(
    paymentPayload: unknown,
    paymentRequirements: PaymentRequirements
  ): Promise<SettlementResponse> {
    const body = await this.post('/settle', {
      x402Version: X402_VERSION,
      paymentPayload,
      paymentRequirements,
    });
    return {
      success: body.success === true,
      transaction: typeof body.transaction === 'string' ? body.transaction : undefined,
      network: typeof body.network === 'string' ? body.network : undefined,
      errorReason: typeof body.errorReason === 'string' ? body.errorReason : undefined,
      pending: body.pending === true || body.status === 'settlement_pending',
    };
  }
}

export function base64Json(value: unknown): string {
  return btoa(JSON.stringify(value));
}

export function decodeBase64Json(header: string): unknown {
  return JSON.parse(atob(header));
}

/**
 * The address that paid, when the payload names one.
 *
 * Refunds are on-chain, so a settled-but-undelivered result needs somewhere to send the money back —
 * and the payment payload is the only place that address exists. The three shapes are the ones the
 * `exact` scheme's transfer methods use (EIP-3009, Permit2, ERC-7710); anything else returns null
 * rather than a guess, so a receipt never records an address that was not the payer.
 */
export function payerFromPaymentPayload(paymentPayload: unknown): string | null {
  if (typeof paymentPayload !== 'object' || paymentPayload === null) return null;
  const inner = (paymentPayload as { payload?: unknown }).payload;
  if (typeof inner !== 'object' || inner === null) return null;
  const body = inner as Record<string, unknown>;

  const authorization = body.authorization as { from?: unknown } | undefined;
  if (authorization && typeof authorization.from === 'string') return authorization.from;

  const permit2 = body.permit2Authorization as { from?: unknown } | undefined;
  if (permit2 && typeof permit2.from === 'string') return permit2.from;

  if (typeof body.delegator === 'string') return body.delegator;

  return null;
}
