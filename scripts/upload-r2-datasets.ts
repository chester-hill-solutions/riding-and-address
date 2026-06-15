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
 */
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { RIDING_DATASET_KEYS } from '../src/datasets';

const BUCKET = 'ridings';
const SEARCH_DIRS = ['data/ridings', '.'];

function findLocalFile(key: string): string | null {
  for (const dir of SEARCH_DIRS) {
    const path = join(process.cwd(), dir, key);
    if (existsSync(path)) return path;
  }
  return null;
}

function main(): void {
  const verifyOnly = process.argv.includes('--verify-only');
  const missing: string[] = [];
  const uploaded: string[] = [];

  for (const key of RIDING_DATASET_KEYS) {
    const local = findLocalFile(key);
    if (!local) {
      missing.push(key);
      continue;
    }
    if (!verifyOnly) {
      execSync(`wrangler r2 object put ${BUCKET}/${key} --file "${local}"`, {
        stdio: 'inherit',
      });
      uploaded.push(key);
    }
  }

  console.log('\n--- Verification (R2 head) ---');
  for (const key of RIDING_DATASET_KEYS) {
    try {
      execSync(`wrangler r2 object get ${BUCKET}/${key} --file /dev/null`, { stdio: 'pipe' });
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
