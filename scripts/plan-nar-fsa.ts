#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { planNarDelta, PILOT_CEILINGS, type BaselineSnapshot, type IdentityReview } from '../src/nar-delta';
import { stageManifest } from './lib/nar-stage';

const HELP = `Offline NAR FSA delta planner (default and only mode: dry-run)
  npm run import:nar:plan -- --manifest source.json --baseline baseline.json
    --partitions M5V,NO_POSTAL [--identity identity-review.json]
    [--max-reads 1000000] [--max-writes 100000] [--shrink-review evidence]
    [--out plan.json]
Local files only. No downloads, remote SQL, schema changes or production execution.
Exit 2 means the report has execution blockers; unknown estimates are null, never zero.`;

function main(): void {
  const argv = process.argv.slice(2);
  if (argv.includes('--help')) { console.log(HELP); return; }
  const args = new Map<string, string>();
  const values = new Set(['--manifest', '--baseline', '--partitions', '--identity', '--max-reads', '--max-writes', '--shrink-review', '--out']);
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key === '--dry-run') continue;
    if (!values.has(key) || args.has(key) || !argv[i + 1] || argv[i + 1].startsWith('--')) {
      throw new Error(`Unsupported/duplicate option or missing value: ${key}. Production execution is unavailable.`);
    }
    args.set(key, argv[++i]);
  }
  if (!args.has('--manifest') || !args.has('--baseline') || !args.has('--partitions')) throw new Error(HELP);
  const source = stageManifest(args.get('--manifest')!);
  const baseline = JSON.parse(readFileSync(args.get('--baseline')!, 'utf8')) as BaselineSnapshot;
  const identity = args.has('--identity')
    ? JSON.parse(readFileSync(args.get('--identity')!, 'utf8')) as IdentityReview
    : { mode: 'unverified' as const, evidence: '' };
  const plan = planNarDelta({ source, baseline, identity,
    partitions: args.get('--partitions')!.split(',').map((s) => s.trim()),
    shrinkReview: args.get('--shrink-review'),
    ceilings: { reads: args.has('--max-reads') ? Number(args.get('--max-reads')) : PILOT_CEILINGS.reads,
      writes: args.has('--max-writes') ? Number(args.get('--max-writes')) : PILOT_CEILINGS.writes } });
  const output = JSON.stringify(plan, null, 2) + '\n';
  if (args.has('--out')) writeFileSync(args.get('--out')!, output, { flag: 'wx', mode: 0o600 });
  else process.stdout.write(output);
  if (plan.blockers.length) process.exitCode = 2;
}

try { main(); }
catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
