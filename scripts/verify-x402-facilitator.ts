/**
 * Verify the x402 facilitator envelope against a real facilitator.
 *
 * Closes `docs/ops/x402-security-review.md` item 3, which is the last technical unknown before the
 * rail can be enabled. Runbook: `docs/ops/x402-facilitator-verification.md`.
 *
 *   bun run verify:x402 --dry-run                       # inspect the facilitator only
 *   bun run verify:x402 --payload ./signed-payload.json # full journey, including settlement
 *
 * Without a payload the script proves the envelope: it sends a structurally valid but unsigned
 * payload and checks that the facilitator rejects the *payment* rather than the *request*. With a
 * payload — from any signer, including the official x402 client — it runs the whole journey against
 * a Worker with the rail enabled and reports whether settlement and delivery actually happened.
 */

import { readFileSync } from 'node:fs';
import {
  probeSupported,
  probeVerify,
  summariseSupported,
  type ProbeTarget,
} from './lib/x402-facilitator-probe';
import {
  PAYMENT_SIGNATURE_HEADER,
  toMinorUnits,
  type PaymentRequirements,
} from '../src/x402';

/** USD amount used for the probe. Matches the point-lookup ceiling so the numbers are real. */
const PROBE_AMOUNT_USD = 0.005;

interface Config {
  facilitatorUrl: string;
  token?: string;
  network: string;
  asset: string;
  assetDecimals: number;
  assetName: string;
  assetVersion: string;
  payTo: string;
  maxTimeoutSeconds: number;
  target?: string;
  payloadFile?: string;
}

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}. See docs/ops/x402-facilitator-verification.md for the full set.`);
    process.exit(2);
  }
  return value;
}

function readConfig(): Config {
  return {
    facilitatorUrl: required('X402_FACILITATOR_URL'),
    token: process.env.X402_FACILITATOR_TOKEN,
    network: required('X402_NETWORK'),
    asset: required('X402_ASSET'),
    assetDecimals: Number(process.env.X402_ASSET_DECIMALS ?? '6'),
    assetName: process.env.X402_ASSET_NAME ?? 'USDC',
    assetVersion: process.env.X402_ASSET_VERSION ?? '2',
    payTo: required('X402_PAY_TO'),
    maxTimeoutSeconds: Number(process.env.X402_MAX_TIMEOUT_SECONDS ?? '60'),
    target: arg('target') ?? process.env.CANCODER_TARGET,
    payloadFile: arg('payload'),
  };
}

/** The requirements we would put in a `PAYMENT-REQUIRED` header for a point lookup. */
function requirementsFor(config: Config): PaymentRequirements {
  return {
    scheme: 'exact',
    network: config.network,
    amount: toMinorUnits(PROBE_AMOUNT_USD, config.assetDecimals),
    asset: config.asset,
    payTo: config.payTo,
    maxTimeoutSeconds: config.maxTimeoutSeconds,
    extra: { name: config.assetName, version: config.assetVersion },
  };
}

/**
 * A structurally valid, unsigned payload in the EIP-3009 shape the `exact` scheme uses. Every field a
 * facilitator validates is present; only the signature is absent, which is the point.
 */
function unsignedPayload(config: Config, requirements: PaymentRequirements) {
  return {
    x402Version: 2,
    scheme: 'exact',
    network: config.network,
    payload: {
      signature: '0x',
      authorization: {
        from: '0x0000000000000000000000000000000000000000',
        to: config.payTo,
        value: requirements.amount,
        validAfter: '0',
        validBefore: String(Math.floor(Date.now() / 1000) + config.maxTimeoutSeconds),
        nonce: `0x${'0'.repeat(64)}`,
      },
    },
  };
}

const results: Array<{ check: string; outcome: 'pass' | 'fail' | 'warn' | 'skip'; detail: string }> = [];

function record(check: string, outcome: 'pass' | 'fail' | 'warn' | 'skip', detail: string) {
  results.push({ check, outcome, detail });
  const mark = { pass: '  PASS', fail: '  FAIL', warn: '  WARN', skip: '  SKIP' }[outcome];
  console.log(`${mark}  ${check}\n        ${detail}`);
}

async function main() {
  const config = readConfig();
  const target: ProbeTarget = { facilitatorUrl: config.facilitatorUrl, token: config.token };
  const requirements = requirementsFor(config);

  console.log(`Facilitator: ${config.facilitatorUrl}`);
  console.log(`Network/asset: ${config.network} / ${config.asset}\n`);

  // 1. Capability discovery, when the facilitator offers it.
  const supported = summariseSupported(await probeSupported(target), config);
  if (!supported.reachable) {
    record('facilitator advertises /supported', 'skip', 'not implemented, or unreachable — not required');
  } else if (supported.listsNetwork === false) {
    record('configured network is supported', 'fail', `${config.network} is not in the advertised list`);
  } else if (supported.listsAsset === false) {
    record('configured asset is supported', 'fail', `${config.asset} is not in the advertised list`);
  } else {
    record('configured network and asset are advertised', 'pass', 'listed, or the shape was not parseable');
  }

  // 2. The envelope. This is the check that item 3 is actually about.
  const verdict = await probeVerify(target, unsignedPayload(config, requirements), requirements);
  switch (verdict.shape) {
    case 'envelope-accepted':
      record('our /verify envelope is understood', 'pass', `rejected the payment, not the request: ${verdict.detail}`);
      break;
    case 'envelope-rejected':
      record('our /verify envelope is understood', 'fail', `the facilitator rejected the request shape: ${verdict.detail}`);
      break;
    case 'endpoint-missing':
      record('our /verify envelope is understood', 'fail', `no /verify at that URL (HTTP ${verdict.status}) — check X402_FACILITATOR_URL`);
      break;
    case 'unreachable':
      record('our /verify envelope is understood', 'fail', `could not reach the facilitator: ${verdict.detail}`);
      break;
    case 'inconclusive':
      record('our /verify envelope is understood', 'warn', `HTTP ${verdict.status} — read the body and judge: ${verdict.detail}`);
      break;
  }

  // 3. The full journey, when a signed payload is supplied.
  if (!config.payloadFile) {
    record('settlement end to end', 'skip', 'no --payload given; supply a signed payload to run it');
  } else if (!config.target) {
    record('settlement end to end', 'skip', 'no --target given (a Worker with the rail enabled)');
  } else {
    const paymentPayload = JSON.parse(readFileSync(config.payloadFile, 'utf8'));
    const quoteResponse = await fetch(`${config.target}/api/quote?postal=K1A0A6`);
    const quote = (await quoteResponse.json()) as { offerId?: string };
    if (!quote.offerId) {
      record('quote before accepting', 'fail', `no offerId from ${config.target}/api/quote`);
    } else {
      const accept = await fetch(`${config.target}/api/quote/accept?offer=${quote.offerId}`, {
        method: 'POST',
        headers: { [PAYMENT_SIGNATURE_HEADER]: btoa(JSON.stringify(paymentPayload)) },
      });
      const body = (await accept.text()).slice(0, 400);
      if (accept.ok) {
        record('settlement end to end', 'pass', `HTTP ${accept.status}: ${body}`);
      } else {
        record('settlement end to end', 'fail', `HTTP ${accept.status}: ${body}`);
      }
    }
  }

  const count = (outcome: string) => results.filter((entry) => entry.outcome === outcome).length;
  console.log(
    `\n${count('pass')} passed, ${count('fail')} failed, ${count('warn')} inconclusive, ` +
      `${count('skip')} skipped.`
  );
  process.exit(count('fail') ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
