/**
 * Issue, inspect and revoke browser API keys for /api/search.
 *
 * These keys are public identifiers, not secrets — they ride in a script tag and anyone can read
 * them. Their security is the per-key origin allowlist plus the daily cap, so both matter more
 * than key hygiene does. See docs/oda-geolocation-contract.md.
 *
 * Usage:
 *   npm run keys -- create --label "Acme" --origins "https://acme.com,https://*.acme.com" --daily 50000
 *   npm run keys -- list --remote
 *   npm run keys -- show pk_live_... --remote
 *   npm run keys -- revoke pk_live_... --remote
 *   npm run keys -- origins pk_live_... --origins "https://acme.com" --remote
 */
import { execSync } from 'node:child_process';
import { writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { generateApiKey, originMatches, type ApiKeyRecord } from '../src/api-keys';

const BINDING = 'API_KEYS';
const DEFAULT_DAILY_LIMIT = 100_000;

interface Options {
  command: string;
  target?: string;
  label?: string;
  origins: string[];
  daily?: number;
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

  if (argv[1] && !argv[1].startsWith('--')) options.target = argv[1];

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--label' && argv[i + 1]) options.label = argv[++i];
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

function kvGet(options: Options, key: string): ApiKeyRecord | null {
  try {
    const raw = kv(options, `key get "${key}"`);
    return JSON.parse(raw) as ApiKeyRecord;
  } catch {
    return null;
  }
}

/** Catch an allowlist that cannot match anything before it goes live and silently 403s. */
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
    // A pattern that cannot match its own domain is almost always a typo.
    const probe = origin.replace('*.', 'sub.');
    if (!originMatches(probe, origin)) {
      throw new Error(`Origin pattern "${origin}" does not match anything — check the syntax.`);
    }
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  switch (options.command) {
    case 'create': {
      validateOrigins(options.origins);
      const record: ApiKeyRecord = {
        id: generateApiKey(options.remote),
        label: options.label,
        origins: options.origins,
        dailyLimit: options.daily ?? DEFAULT_DAILY_LIMIT,
        createdAt: new Date().toISOString(),
      };
      kvPut(options, `key:${record.id}`, record);
      console.log(`\nCreated ${record.id}`);
      console.log(`  label   : ${record.label || '(none)'}`);
      console.log(`  origins : ${record.origins.join(', ')}`);
      console.log(`  daily   : ${record.dailyLimit.toLocaleString()} requests`);
      console.log(`\n  <script src="https://your-worker.workers.dev/embed.js" data-key="${record.id}" defer></script>\n`);
      console.log('  This key is public. Its security is the origin allowlist above, not secrecy.\n');
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
        const record = kvGet(options, name);
        if (!record) continue;
        const status = record.disabled ? 'REVOKED' : 'active';
        console.log(
          `${record.id}  ${status.padEnd(8)}  ${(record.label || '-').padEnd(20)}  ${record.origins.join(', ')}`
        );
      }
      break;
    }

    case 'show': {
      if (!options.target) throw new Error('Usage: keys show <pk_...>');
      const record = kvGet(options, `key:${options.target}`);
      if (!record) throw new Error(`No such key: ${options.target}`);
      console.log(JSON.stringify(record, null, 2));
      break;
    }

    case 'revoke': {
      if (!options.target) throw new Error('Usage: keys revoke <pk_...>');
      const record = kvGet(options, `key:${options.target}`);
      if (!record) throw new Error(`No such key: ${options.target}`);
      kvPut(options, `key:${record.id}`, { ...record, disabled: true });
      console.log(`Revoked ${record.id}.`);
      console.log('Note: workers cache keys per isolate, so this can take a few minutes to apply everywhere.');
      break;
    }

    case 'origins': {
      if (!options.target) throw new Error('Usage: keys origins <pk_...> --origins "https://a.com,..."');
      validateOrigins(options.origins);
      const record = kvGet(options, `key:${options.target}`);
      if (!record) throw new Error(`No such key: ${options.target}`);
      kvPut(options, `key:${record.id}`, { ...record, origins: options.origins });
      console.log(`Updated ${record.id} origins: ${options.origins.join(', ')}`);
      break;
    }

    default:
      console.log(`Browser API keys for /api/search.

  npm run keys -- create --label "Acme" --origins "https://acme.com,https://*.acme.com" [--daily N] [--remote]
  npm run keys -- list [--remote]
  npm run keys -- show <pk_...> [--remote]
  npm run keys -- revoke <pk_...> [--remote]
  npm run keys -- origins <pk_...> --origins "https://acme.com" [--remote]

Keys are public identifiers. Security comes from the origin allowlist and the daily cap.`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
