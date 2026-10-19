#!/usr/bin/env node
/**
 * Secret-literal gate.
 *
 * A credential that is committed cannot be rotated out of history. That is the whole point: git
 * keeps every version of every file, so a value in a commit is a value forever, and "rotate it"
 * does not remove it — it only makes the old value useless. Which is fine for a value that was
 * never a secret, and not fine at all for one that was.
 *
 * This gate fails the build when a tracked file carries a credential-shaped literal, with one
 * narrow exception: an entry in `scripts/secret-allowlist.json`. The allowlist is a tracked,
 * diff-able file, so putting a secret on it is a reviewable decision rather than a quiet one — and
 * an entry whose file no longer contains the literal is reported as stale, so the list cannot
 * quietly accumulate exceptions nobody looks at.
 *
 *   node scripts/check-secrets.mjs
 *
 * Wired into `npm run validate` and CI.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ALLOWLIST_PATH = path.join(ROOT, 'scripts', 'secret-allowlist.json');

/**
 * Credential shapes.
 *
 * Every pattern requires a plausible body, so a *placeholder* — `sk_test_…`, `pk_live_…` — does
 * not match and the documentation that shows the shape stays writable. `sk_test_…` in
 * `portal/.env.example` is a placeholder; `sk_test_<24 real characters>` is a key.
 */
const PATTERNS = [
  { name: 'browser-key', re: /\b(?:pk|pk_live|pk_test)_[A-Za-z0-9]{16,}\b/g },
  { name: 'server-key', re: /\bsk_(?:live|test)_[A-Za-z0-9]{16,}\b/g },
  { name: 'stripe-secret', re: /\bsk_[A-Za-z0-9]{24,}\b/g },
  { name: 'stripe-webhook', re: /\bwhsec_[A-Za-z0-9]{16,}\b/g },
  { name: 'google-api-key', re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { name: 'aws-access-key', re: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: 'slack-token', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g },
  { name: 'private-key', re: /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/g },
];

/** Files that are not text, or are generated, or hold no credential. */
const SKIP_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.woff', '.woff2', '.ttf', '.eot',
  '.geojson', '.zip', '.gz', '.pdf', '.mp4', '.webm',
]);

const violations = [];
const allowlist = loadAllowlist();

function loadAllowlist() {
  if (!existsSync(ALLOWLIST_PATH)) return {};
  const parsed = JSON.parse(readFileSync(ALLOWLIST_PATH, 'utf8'));
  const entries = parsed.exceptions ?? parsed;
  return Object.fromEntries(
    Object.entries(entries).map(([file, reason]) => [file, typeof reason === 'string' ? reason : reason?.reason ?? ''])
  );
}

/** Tracked files only: an untracked file is not in history, and history is the problem. */
function trackedFiles() {
  const out = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' });
  return out.split('\0').filter(Boolean);
}

function rel(file) {
  return path.relative(ROOT, file);
}

const tracked = trackedFiles();

for (const file of tracked) {
  const full = path.join(ROOT, file);
  if (!existsSync(full)) continue;
  if (SKIP_EXTENSIONS.has(path.extname(file).toLowerCase())) continue;
  if (!statSync(full).isFile()) continue;

  let text;
  try {
    text = readFileSync(full, 'utf8');
  } catch {
    continue; // not text; a binary that slipped past the extension list
  }
  // A NUL byte means it is not text, whatever its extension says.
  if (text.includes('\0')) continue;

  for (const { name, re } of PATTERNS) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(text)) !== null) {
      const line = text.slice(0, match.index).split('\n').length;
      const reason = allowlist[file];
      if (reason) continue;
      violations.push({
        rule: name,
        file,
        line,
        detail: `credential-shaped literal in a tracked file — move it to the secret store, or record an exception in scripts/secret-allowlist.json`,
      });
    }
  }
}

// An allowlist entry whose file no longer carries the literal is dead weight. Report it, so the
// list cannot become a place where exceptions go to be forgotten.
const stale = [];
for (const file of Object.keys(allowlist)) {
  const full = path.join(ROOT, file);
  if (!existsSync(full)) {
    stale.push(file);
    continue;
  }
  let text = '';
  try {
    text = readFileSync(full, 'utf8');
  } catch {
    continue;
  }
  const matched = PATTERNS.some(({ re }) => {
    re.lastIndex = 0;
    re.test(text);
    return re.lastIndex > 0;
  });
  if (!matched) stale.push(file);
}

if (violations.length || stale.length) {
  if (violations.length) {
    console.error(`secrets: ${violations.length} credential-shaped literal(s)\n`);
    for (const v of violations) {
      console.error(`  [${v.rule}] ${v.file}:${v.line} — ${v.detail}`);
    }
  }
  if (stale.length) {
    console.error(`\nsecrets: ${stale.length} stale allowlist entr(ies)\n`);
    for (const file of stale) {
      console.error(`  [stale-allowlist] ${file} — the file no longer carries a credential-shaped literal; remove the entry`);
    }
  }
  console.error('\nSee docs/ops/demo-browser-key-rotation.md.');
  process.exit(1);
}

const allowed = Object.keys(allowlist).length;
console.log(
  `secrets: ok (${tracked.length} tracked files scanned; ` +
    `${allowed} allowlisted exception${allowed === 1 ? '' : 's'})`
);
