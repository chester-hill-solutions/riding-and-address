/**
 * Build the address autocomplete index (oda_street_suggest + oda_suggest_fts).
 *
 * Purely additive and derived: every row is computed inside D1 from oda_street_ranges and
 * oda_city_centroids, which the ODA import already populated. Nothing is downloaded, no CSV is
 * parsed, and oda_addresses is never read — so this takes seconds, not the hours a re-import
 * would, and it can be re-run per province at any time.
 *
 * Usage:
 *   npm run build:oda:suggest -- --provinces ON --local
 *   npm run build:oda:suggest -- --provinces ON --remote
 *   npm run build:oda:suggest -- --provinces ALL --remote --database oda-addresses
 */
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import {
  getOdaSuggestSchemaSql,
  buildSuggestPopulateSql,
} from '../src/oda-schema';
import { SUPPORTED_ODA_PROVINCES } from '../src/oda-import';

interface BuildOptions {
  provinces: string[];
  remote: boolean;
  database: string;
  outputDir: string;
  skipSchema: boolean;
}

function parseArgs(argv: string[]): BuildOptions {
  const options: BuildOptions = {
    provinces: ['ON'],
    remote: false,
    database: 'oda-addresses',
    outputDir: '.oda-suggest',
    skipSchema: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--provinces' && argv[i + 1]) {
      const raw = argv[++i].trim().toUpperCase();
      options.provinces =
        raw === 'ALL'
          ? [...SUPPORTED_ODA_PROVINCES]
          : raw.split(',').map((p) => p.trim().toUpperCase()).filter(Boolean);
    } else if (arg === '--remote') {
      options.remote = true;
    } else if (arg === '--local') {
      options.remote = false;
    } else if (arg === '--database' && argv[i + 1]) {
      options.database = argv[++i];
    } else if (arg === '--output-dir' && argv[i + 1]) {
      options.outputDir = argv[++i];
    } else if (arg === '--skip-schema') {
      options.skipSchema = true;
    }
  }

  return options;
}

function executeSqlFile(database: string, remote: boolean, filePath: string): void {
  const remoteFlag = remote ? '--remote' : '--local';
  execSync(`npx wrangler d1 execute ${database} ${remoteFlag} --file=${filePath}`, {
    stdio: 'inherit',
  });
}

function runStatements(
  database: string,
  remote: boolean,
  outputDir: string,
  name: string,
  statements: string[]
): void {
  const filePath = join(outputDir, `${name}.sql`);
  writeFileSync(filePath, statements.map((s) => (s.trim().endsWith(';') ? s : `${s};`)).join('\n'));
  try {
    executeSqlFile(database, remote, filePath);
  } finally {
    try {
      unlinkSync(filePath);
    } catch {
      // ignore missing temp file
    }
  }
}

/** Inline params — wrangler d1 execute --file takes no bind parameters. Province codes are
 *  validated against SUPPORTED_ODA_PROVINCES before reaching here. */
function inlineParams(sql: string, params: string[]): string {
  let i = 0;
  return sql.replace(/\?/g, () => `'${params[i++].replace(/'/g, "''")}'`);
}

function queryD1Json<T>(database: string, remote: boolean, command: string): Array<{ results?: T[] }> {
  const remoteFlag = remote ? '--remote' : '--local';
  const output = execSync(
    `npx wrangler d1 execute ${database} ${remoteFlag} --command ${JSON.stringify(command)} --json`,
    { encoding: 'utf-8' }
  );
  return JSON.parse(output) as Array<{ results?: T[] }>;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  const unknown = options.provinces.filter(
    (p) => !(SUPPORTED_ODA_PROVINCES as readonly string[]).includes(p)
  );
  if (unknown.length) {
    console.error(`Unknown province(s): ${unknown.join(', ')}`);
    console.error(`Supported: ${SUPPORTED_ODA_PROVINCES.join(', ')}`);
    process.exit(1);
  }

  mkdirSync(options.outputDir, { recursive: true });

  console.log(
    `Building suggest index for ${options.provinces.join(', ')} on ${options.database} (${options.remote ? 'remote' : 'local'})`
  );

  if (!options.skipSchema) {
    console.log('Applying suggest schema...');
    runStatements(options.database, options.remote, options.outputDir, 'schema', getOdaSuggestSchemaSql());
  }

  for (const province of options.provinces) {
    console.log(`\nBuilding ${province}...`);
    const statements = buildSuggestPopulateSql(province).map(({ sql, params }) =>
      inlineParams(sql, params)
    );
    runStatements(options.database, options.remote, options.outputDir, `populate-${province}`, statements);

    const counted = queryD1Json<{ cnt: number }>(
      options.database,
      options.remote,
      `SELECT COUNT(*) AS cnt FROM oda_street_suggest WHERE province = '${province}';`
    );
    const count = counted[0]?.results?.[0]?.cnt ?? 0;
    console.log(`${province}: ${count.toLocaleString()} street suggestions`);

    if (count === 0) {
      console.warn(
        `WARNING: ${province} produced no rows. oda_street_ranges/oda_city_centroids are probably not populated for it — run "npm run import:oda:centroids" first.`
      );
    }
  }

  console.log('\nDone. Enable with ODA_SUGGEST_ENABLED=true.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
