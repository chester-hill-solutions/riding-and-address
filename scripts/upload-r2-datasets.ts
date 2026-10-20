/**
 * Upload riding boundary GeoJSON files to R2 and verify presence.
 *
 * Place files alongside this script or in ./data/ridings/:
 *   federalridings-2024.geojson
 *   quebecridings-2025.geojson
 *   ontarioridings-2022.geojson
 *
 * Usage:
 *   npx tsx scripts/upload-r2-datasets.ts
 *   npx tsx scripts/upload-r2-datasets.ts --verify-only
 *   npx tsx scripts/upload-r2-datasets.ts --remote
 */
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { getLiveDatasetKeys } from '../src/datasets';

const BUCKET = 'ridings';
/** `data/ridings` holds the riding boundaries; `data/geo` holds the municipal and sub-municipal ones. */
const SEARCH_DIRS = ['data/ridings', 'data/geo', '.'];

function findLocalFile(key: string): string | null {
  for (const dir of SEARCH_DIRS) {
    const path = join(process.cwd(), dir, key);
    if (existsSync(path)) return path;
  }
  return null;
}

function main(): void {
  const verifyOnly = process.argv.includes('--verify-only');
  const remote = process.argv.includes('--remote');
  const remoteFlag = remote ? ' --remote' : '';
  const missing: string[] = [];
  const uploaded: string[] = [];

  // Only datasets marked `live` are published. A `registered` dataset has a route and a
  // documented shape but its data is not ready to serve, and the municipal layers are far
  // too large for the Worker to load into an isolate — publishing one by accident would
  // turn a clean 404 into an out-of-memory 500. Flip the status in src/geo-datasets.ts
  // to publish a level.
  const keys = getLiveDatasetKeys();

  for (const key of keys) {
    const local = findLocalFile(key);
    if (!local) {
      missing.push(key);
      continue;
    }
    if (!verifyOnly) {
      execSync(`wrangler r2 object put ${BUCKET}/${key} --file "${local}"${remoteFlag}`, {
        stdio: 'inherit',
      });
      uploaded.push(key);
    }
  }

  console.log('\n--- Verification (R2 head) ---');
  for (const key of keys) {
    try {
      execSync(`wrangler r2 object get ${BUCKET}/${key} --file /dev/null${remoteFlag}`, { stdio: 'pipe' });
      console.log(`OK  ${key}`);
    } catch {
      console.log(`MISSING  ${key}`);
    }
  }

  if (missing.length) {
    console.warn('\nLocal files not found (skipped upload):');
    for (const key of missing) console.warn(`  - ${key}`);
    console.warn('Obtain GeoJSON boundary files and place them in data/ridings/ or project root.');
  }

  if (uploaded.length) {
    console.log(`\nUploaded ${uploaded.length} file(s).`);
  }
}

main();
