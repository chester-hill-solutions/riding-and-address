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

export interface PaymentRequired {
  x402Version: number;
  error?: string;
  resource: { url: string; description: string; mimeType: string };
  accepts: PaymentRequirements[];
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
 * NOTE: the request envelope (`paymentPayload` + `paymentRequirements`) and the response field names
 * follow the v2 facilitator contract; confirm them against the specific facilitator chosen for
 * production before enabling the rail. A mis-shaped call fails closed here (verify returns invalid),
 * so it cannot mis-charge — but it also will not work.
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
      throw new Error(`Facilitator ${path} returned ${response.status}`);
    }
    return (await response.json()) as Record<string, unknown>;
  }

  async verify(
    paymentPayload: unknown,
    paymentRequirements: PaymentRequirements
  ): Promise<VerificationResult> {
    const body = await this.post('/verify', { paymentPayload, paymentRequirements });
    return {
      isValid: body.isValid === true,
      invalidReason: typeof body.invalidReason === 'string' ? body.invalidReason : undefined,
    };
  }

  async settle(
    paymentPayload: unknown,
    paymentRequirements: PaymentRequirements
  ): Promise<SettlementResponse> {
    const body = await this.post('/settle', { paymentPayload, paymentRequirements });
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
