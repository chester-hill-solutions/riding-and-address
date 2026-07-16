#!/usr/bin/env node
/**
 * Billing / auth invariants gate (strictness-ratchet).
 *
 * Grounded in findings from the 2026-07-16 ratchet cycle:
 * - void reportStripeMeter lost meter events on isolate exit
 * - lookup vs search remapped the same KeyDenialReason to different HTTP statuses
 * - free-allowance / unit-price literals drifted across Worker + portal
 *
 *   node scripts/check-billing-invariants.mjs
 *
 * Hard-fails (baseline 0) on regressions. Wired into `npm run validate`.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const FILE_RE = /\.(tsx?|jsx?|mjs|cjs|md)$/;
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  '.git',
  '.wrangler',
  'coverage',
  '.claude',
  'data',
]);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (FILE_RE.test(entry)) out.push(full);
  }
  return out;
}

function rel(file) {
  return path.relative(ROOT, file);
}

const violations = [];

function fail(rule, file, line, detail) {
  violations.push({ rule, file: rel(file), line, detail });
}

const files = walk(ROOT);

// ── Rule: never fire-and-forget Stripe meter with void ───────────────────────
for (const file of files) {
  if (!rel(file).startsWith('src/')) continue;
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (/\bvoid\s+reportStripeMeter\b/.test(line)) {
      fail(
        'void-stripe-meter',
        file,
        i + 1,
        'Use waitUntil(reportStripeMeter(...)) or await — void drops events on isolate exit'
      );
    }
  });
}

// ── Rule: no ad-hoc KeyDenialReason → status maps outside api-keys.ts ────────
const AD_HOC_STATUS = [
  /auth\.reason\s*===\s*'KEY_REQUIRED'\s*\?\s*401/,
  /reason\s*===\s*'ORIGIN_NOT_ALLOWED'\s*\|\|/,
  /auth\.reason\s*===\s*'WRONG_KEY_KIND'/,
];
for (const file of files) {
  const r = rel(file);
  if (r === 'src/api-keys.ts') continue;
  if (!r.startsWith('src/') && !r.startsWith('test/')) continue;
  // The canonical helper + its unit test are allowed to mention reasons.
  if (r === 'test/api-keys.test.ts') continue;
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    for (const re of AD_HOC_STATUS) {
      if (re.test(line) && !line.includes('httpStatusForKeyDenial')) {
        fail(
          'ad-hoc-key-status',
          file,
          i + 1,
          'Map KeyDenialReason via httpStatusForKeyDenial() in src/api-keys.ts only'
        );
      }
    }
  });
}

// ── Rule: unit-price display literal only in pricing.ts + docs ───────────────
const PRICE_RE = /\$0\.005\b/;
const PRICE_ALLOW = [
  /^portal\/app\/lib\/pricing\.ts$/,
  /^docs\//,
  /^scripts\/check-billing-invariants\.mjs$/,
  /^docs\/reviews\//,
  /^docs\/adr\//,
];
for (const file of files) {
  const r = rel(file);
  if (PRICE_ALLOW.some((re) => re.test(r))) continue;
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (PRICE_RE.test(line)) {
      fail(
        'unit-price-literal',
        file,
        i + 1,
        'Use formatMeteredUnitPrice() / METERED_UNIT_PRICE_USD from portal/app/lib/pricing.ts'
      );
    }
  });
}

// ── Rule: free-allowance constant values must match across Worker + portal ────
function extractAllowance(file, name) {
  const src = readFileSync(file, 'utf8');
  const m = src.match(new RegExp(`export const ${name}\\s*=\\s*(\\d+)`));
  return m ? Number(m[1]) : null;
}

const workerAllowance = extractAllowance(
  path.join(ROOT, 'src/customer.ts'),
  'DEFAULT_FREE_MONTHLY_ALLOWANCE'
);
const portalAllowance = extractAllowance(
  path.join(ROOT, 'portal/app/lib/pricing.ts'),
  'DEFAULT_FREE_MONTHLY_ALLOWANCE'
);
if (workerAllowance == null || portalAllowance == null) {
  fail(
    'allowance-constant-missing',
    path.join(ROOT, 'src/customer.ts'),
    1,
    'DEFAULT_FREE_MONTHLY_ALLOWANCE must exist in src/customer.ts and portal/app/lib/pricing.ts'
  );
} else if (workerAllowance !== portalAllowance) {
  fail(
    'allowance-constant-drift',
    path.join(ROOT, 'portal/app/lib/pricing.ts'),
    1,
    `Worker=${workerAllowance} portal=${portalAllowance} — keep DEFAULT_FREE_MONTHLY_ALLOWANCE identical`
  );
}

// ── Rule: bare fuseLimit: 1000 outside allowlisted definition sites ───────────
const FUSE_LITERAL_RE = /fuseLimit\s*:\s*1000\b/;
const FUSE_ALLOW = [
  /^src\/customer\.ts$/,
  /^portal\/app\/lib\/pricing\.ts$/,
  /^portal\/app\/db\/schema\.ts$/,
  /^test\//,
  /^scripts\/check-billing-invariants\.mjs$/,
  /^docs\//,
];
for (const file of files) {
  const r = rel(file);
  if (FUSE_ALLOW.some((re) => re.test(r))) continue;
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (FUSE_LITERAL_RE.test(line)) {
      fail(
        'fuse-limit-literal',
        file,
        i + 1,
        'Use DEFAULT_FREE_MONTHLY_ALLOWANCE instead of fuseLimit: 1000'
      );
    }
  });
}

if (violations.length) {
  console.error(`billing-invariants: ${violations.length} violation(s)\n`);
  for (const v of violations) {
    console.error(`  [${v.rule}] ${v.file}:${v.line} — ${v.detail}`);
  }
  console.error('\nSee docs/adr/0005-billing-invariants-gate.md');
  process.exit(1);
}

console.log('billing-invariants: ok (void-stripe-meter, key-status, price/allowance literals)');
