/**
 * Issue, inspect and revoke Customer API keys (Server sk_* + Browser pk_*).
 *
 * Browser keys are public identifiers (origin allowlist + daily cap).
 * Server keys are secrets (stored hashed); shown once at create time.
 *
 * Usage:
 *   npm run keys -- customer create --id cust_acme --plan free --label "Acme"
 *   npm run keys -- create-browser --customer cust_acme --origins "https://acme.com" --label "Widget"
 *   npm run keys -- create-server --customer cust_acme --label "Backend"
 *   npm run keys -- list --remote
 *   npm run keys -- show pk_live_... --remote
 *   npm run keys -- revoke pk_live_... --remote
 *   npm run keys -- origins pk_live_... --origins "https://acme.com" --remote
 */
import { execSync } from 'node:child_process';
import { writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  generateApiKey,
  generateServerKey,
  originMatches,
  serverKeyDisplayId,
  sha256Hex,
  type ApiKeyRecord,
} from '../src/api-keys';
import { defaultFuseLimit, DEFAULT_FREE_MONTHLY_ALLOWANCE, type CustomerPlan, type CustomerRecord } from '../src/customer';

const BINDING = 'API_KEYS';
const DEFAULT_DAILY_LIMIT = 100_000;

interface Options {
  command: string;
  subcommand?: string;
  target?: string;
  label?: string;
  origins: string[];
  daily?: number;
  customerId?: string;
  plan?: CustomerPlan;
  fuseLimit?: number;
  fuseSoftWarn?: boolean;
  batchEnabled?: boolean;
  remote: boolean;
  namespace: string;
  outputDir: string;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    command: argv[0] || 'help',
    origins: [],
    remote: false,
    namespace: BINDING,
    outputDir: '.keys',
  };

  let i = 1;
  if (argv[1] && !argv[1].startsWith('--')) {
    if (options.command === 'customer') {
      options.subcommand = argv[1];
      i = 2;
    } else {
      options.target = argv[1];
    }
  }

  for (; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--label' && argv[i + 1]) options.label = argv[++i];
    else if (arg === '--id' && argv[i + 1]) options.customerId = argv[++i];
    else if (arg === '--customer' && argv[i + 1]) options.customerId = argv[++i];
    else if (arg === '--plan' && argv[i + 1]) options.plan = argv[++i] as CustomerPlan;
    else if (arg === '--fuse' && argv[i + 1]) options.fuseLimit = parseInt(argv[++i], 10);
    else if (arg === '--soft-warn') options.fuseSoftWarn = true;
    else if (arg === '--batch') options.batchEnabled = true;
    else if (arg === '--origins' && argv[i + 1]) {
      options.origins = argv[++i].split(',').map((o) => o.trim()).filter(Boolean);
    } else if (arg === '--daily' && argv[i + 1]) options.daily = parseInt(argv[++i], 10);
    else if (arg === '--remote') options.remote = true;
    else if (arg === '--local') options.remote = false;
    else if (arg === '--binding' && argv[i + 1]) options.namespace = argv[++i];
  }

  return options;
}

function kv(options: Options, args: string): string {
  const scope = options.remote ? '--remote' : '--local';
  return execSync(`npx wrangler kv ${args} --binding ${options.namespace} ${scope}`, {
    encoding: 'utf-8',
  });
}

function kvPut(options: Options, key: string, value: unknown): void {
  mkdirSync(options.outputDir, { recursive: true });
  const file = join(options.outputDir, 'value.json');
  writeFileSync(file, JSON.stringify(value));
  try {
    kv(options, `key put "${key}" --path=${file}`);
  } finally {
    try {
      unlinkSync(file);
    } catch {
      // ignore
    }
  }
}

function kvGet<T>(options: Options, key: string): T | null {
  try {
    const raw = kv(options, `key get "${key}"`);
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function validateOrigins(origins: string[]): void {
  if (origins.length === 0) {
    throw new Error('At least one --origins entry is required. An empty allowlist allows nothing.');
  }
  for (const origin of origins) {
    if (origin === '*') {
      console.warn(
        'WARNING: "*" allows any site to use this key. It is then a public, unattributable key — ' +
          'the daily cap is the only thing bounding abuse.'
      );
      continue;
    }
    if (!/^https?:\/\//.test(origin)) {
      throw new Error(`Origin must include a scheme: "${origin}" (try https://${origin})`);
    }
    if (/\/[^/]/.test(origin.replace(/^https?:\/\//, ''))) {
      throw new Error(
        `Origins cannot contain a path: "${origin}". The Origin header never carries one.`
      );
    }
    const probe = origin.replace('*.', 'sub.');
    if (!originMatches(probe, origin)) {
      throw new Error(`Origin pattern "${origin}" does not match anything — check the syntax.`);
    }
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  switch (options.command) {
    case 'customer': {
      if (options.subcommand !== 'create') {
        throw new Error('Usage: keys customer create --id cust_… --plan free|metered|enterprise');
      }
      if (!options.customerId) throw new Error('--id is required');
      const plan = options.plan || 'free';
      const record: CustomerRecord = {
        id: options.customerId,
        plan,
        fuseLimit: options.fuseLimit ?? defaultFuseLimit(plan, {
          FREE_MONTHLY_ALLOWANCE: String(DEFAULT_FREE_MONTHLY_ALLOWANCE),
        } as never),
        fuseSoftWarn: options.fuseSoftWarn,
        batchEnabled: options.batchEnabled,
        label: options.label,
        updatedAt: new Date().toISOString(),
      };
      kvPut(options, `customer:${record.id}`, record);
      console.log(`\nCreated customer ${record.id}`);
      console.log(`  plan   : ${record.plan}`);
      console.log(`  fuse   : ${record.fuseLimit || 'unlimited'}${record.fuseSoftWarn ? ' (soft-warn)' : ''}`);
      console.log(`  batch  : ${record.batchEnabled ? 'enabled' : 'off'}`);
      break;
    }

    case 'create':
    case 'create-browser': {
      if (!options.customerId) throw new Error('--customer cust_… is required');
      validateOrigins(options.origins);
      const record: ApiKeyRecord = {
        id: generateApiKey(options.remote),
        kind: 'browser',
        customerId: options.customerId,
        label: options.label,
        origins: options.origins,
        dailyLimit: options.daily ?? DEFAULT_DAILY_LIMIT,
        createdAt: new Date().toISOString(),
      };
      kvPut(options, `key:${record.id}`, record);
      console.log(`\nCreated Browser key ${record.id}`);
      console.log(`  customer: ${record.customerId}`);
      console.log(`  label   : ${record.label || '(none)'}`);
      console.log(`  origins : ${record.origins.join(', ')}`);
      console.log(`  daily   : ${record.dailyLimit.toLocaleString()} requests`);
      console.log(
        `\n  <script src="https://your-worker.workers.dev/embed.js" data-key="${record.id}" defer></script>\n`
      );
      console.log('  This key is public. Its security is the origin allowlist above, not secrecy.\n');
      break;
    }

    case 'create-server': {
      if (!options.customerId) throw new Error('--customer cust_… is required');
      const secret = generateServerKey(options.remote);
      const hash = await sha256Hex(secret);
      const displayId = serverKeyDisplayId(secret);
      const record: ApiKeyRecord = {
        id: displayId,
        kind: 'server',
        customerId: options.customerId,
        label: options.label,
        origins: [],
        dailyLimit: 0,
        secretHash: hash,
        createdAt: new Date().toISOString(),
      };
      kvPut(options, `keyhash:${hash}`, record);
      kvPut(options, `key:${displayId}`, record);
      console.log(`\nCreated Server key ${displayId}`);
      console.log(`  customer: ${record.customerId}`);
      console.log(`  label   : ${record.label || '(none)'}`);
      console.log(`\n  Secret (shown once): ${secret}`);
      console.log(`  Use: Authorization: Bearer ${secret}\n`);
      break;
    }

    case 'list': {
      const raw = kv(options, 'key list --prefix "key:"');
      const keys = JSON.parse(raw) as Array<{ name: string }>;
      if (!keys.length) {
        console.log('No keys.');
        break;
      }
      for (const { name } of keys) {
        const record = kvGet<ApiKeyRecord>(options, name);
        if (!record) continue;
        const status = record.disabled ? 'REVOKED' : 'active';
        console.log(
          `${record.id}  ${(record.kind || '?').padEnd(7)}  ${status.padEnd(8)}  ${(record.customerId || '-').padEnd(16)}  ${(record.label || '-').padEnd(20)}  ${(record.origins || []).join(', ')}`
        );
      }
      break;
    }

    case 'show': {
      if (!options.target) throw new Error('Usage: keys show <pk_…|sk_…>');
      const record = kvGet<ApiKeyRecord>(options, `key:${options.target}`);
      if (!record) throw new Error(`No such key: ${options.target}`);
      console.log(JSON.stringify(record, null, 2));
      break;
    }

    case 'revoke': {
      if (!options.target) throw new Error('Usage: keys revoke <pk_…|sk_…>');
      const record = kvGet<ApiKeyRecord>(options, `key:${options.target}`);
      if (!record) throw new Error(`No such key: ${options.target}`);
      kvPut(options, `key:${record.id}`, { ...record, disabled: true });
      if (record.secretHash) {
        kvPut(options, `keyhash:${record.secretHash}`, { ...record, disabled: true });
      }
      console.log(`Revoked ${record.id}.`);
      console.log('Note: workers cache keys ≤60s, so revocation propagates within about a minute.');
      break;
    }

    case 'origins': {
      if (!options.target) throw new Error('Usage: keys origins <pk_…> --origins "https://a.com,…"');
      validateOrigins(options.origins);
      const record = kvGet<ApiKeyRecord>(options, `key:${options.target}`);
      if (!record) throw new Error(`No such key: ${options.target}`);
      if (record.kind === 'server') throw new Error('Server keys do not use origin allowlists.');
      kvPut(options, `key:${record.id}`, { ...record, origins: options.origins });
      console.log(`Updated ${record.id} origins: ${options.origins.join(', ')}`);
      break;
    }

    default:
      console.log(`Customer API keys (Server sk_* + Browser pk_*).

  npm run keys -- customer create --id cust_acme --plan free [--fuse 1000] [--soft-warn] [--batch]
  npm run keys -- create-browser --customer cust_acme --origins "https://acme.com" [--daily N] [--remote]
  npm run keys -- create-server --customer cust_acme [--label Backend] [--remote]
  npm run keys -- list [--remote]
  npm run keys -- show <pk_…|sk_…> [--remote]
  npm run keys -- revoke <pk_…|sk_…> [--remote]
  npm run keys -- origins <pk_…> --origins "https://acme.com" [--remote]

Browser keys are public. Server secrets are shown once and stored hashed.`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
