# NAR FSA delta planning: offline safety slice

`npm run import:nar:plan` stages **local files** and produces a dry-run delta report. It has no
network client, download command, D1 adapter or execution mode. `--execute`, `--remote`, unknown
flags and duplicate options fail before input files are read. The previous city replacement
command (`import:nar`, including `import:nar:next`) now refuses refreshes before credentials,
SQL, locks or downloads. Queue listing and explicitly requested source discovery remain available.
Do not enable the old daily refresh job: it will now exit nonzero rather than rewrite a city.

This is groundwork for a bounded importer, **not a production-ready importer**. No production
schema migration, import, deployment or paid pilot is part of this change.

## Why production execution remains closed

The existing `oda_addresses` schema has no `ADDR_GUID` or `LOC_GUID`. The old importer discarded
both, so an unmatched old row cannot reliably be called an update, deletion or move. `LOC_GUID`
identifies a location, which may contain multiple addresses/units; it is never the address key.
Real cross-vintage `ADDR_GUID` stability has **not** been validated from cached source data or a
StatCan stability guarantee. Source GUIDs in synthetic tests establish no such guarantee.

The planner requires a complete local province baseline and source manifest to detect movement
outside the selected FSA and preserve aggregate context. For old rows without address GUIDs,
provide a reviewed one-to-one legacy ID bridge with evidence. Exact unique normalized equality
can be counted as informational `unchanged`, but does not authorize inferred additions/deletions.
Without a complete bridge or identity review, `add`, `update`, `delete` and cost fields are `null`,
not guessed numbers or zeros. An explicit review file is an operator assertion for this offline
planner; it is not an automatic certification of cross-vintage identity.

Unknown FTS/internal posting costs, source snapshot reads, row/FSA provenance, receipts and
distributed fencing prevent a trustworthy all-in D1 bound. The report always has
`executable: false`, `totalReadsUpperBound: null` and `totalWritesUpperBound: null`. No flag can
turn it into a production writer. A production adapter must be reviewed separately after these
gaps are resolved; do not wire the old writer behind this report.

## Reproducible local example

With the repository's locked dependencies already installed:

```sh
npm run import:nar:plan -- \
  --manifest test/fixtures/nar/delta/source.json \
  --baseline test/fixtures/nar/delta/baseline.json \
  --identity test/fixtures/nar/delta/identity.json \
  --partitions M5V,NO_POSTAL \
  --max-writes 100000 --max-reads 1000000
```

This fixture has five synthetic province rows, four in the selected partitions. Its report is:

| Measure | Result |
| --- | ---: |
| Normalized old / new rows in scope | 4 / 4 |
| Unchanged / add / update / delete | 2 / 1 / 1 / 1 |
| Missing-postal old / new rows, province-wide | 1 / 1 |
| Address + five-index write component bound | 24 |
| Aggregate-table replacement component bound | 20 |
| Indexed row-read model | 19 |
| All-in production reads / writes | **unknown / unknown** |

The unchanged rows produce no address mutation or row provenance change. The per-FSA local
coverage manifest also records normalized source coverage and its source manifest hash.
**These are synthetic estimates, not a measured production FSA pilot.** No real source archive
or production baseline was cached in the investigation checkout, and none was downloaded.

Exit status is 0 for help, 1 for invalid input, and 2 for a dry-run report containing execution
blockers. `--out path.json` creates a new private local file (0600); it refuses to overwrite one.
Reports include address data: keep real input/output snapshots in ignored `.nar-import/`, not Git.

## Input and completeness contracts

See `test/fixtures/nar/delta/` for runnable JSON/CSV examples and the exported TypeScript types
in `src/nar-delta.ts` and `scripts/lib/nar-stage.ts` for the contracts.

The source manifest lists **every expected address and location part**, its relative path,
SHA-256 and independently expected record count, plus province, vintage and reviewed completeness
evidence. The stage checks every listed checksum/count, duplicate file paths, strict CSV structure
(BOM, quoted commas/newlines and escaped quotes), unique address IDs and coordinate joins. It
retains both source GUIDs. A nonempty malformed postal code is rejected; a genuinely absent postal
code is retained in `NO_POSTAL`. Invalid coordinates/province/address fields are rejected and
counted. Any rejected/unaccounted row blocks the plan, so a raw match count cannot satisfy the
replacement shrink guard.

Checksums prove that local parts match the manifest; they cannot prove that the manifest lists
the whole upstream release. Completeness must be reviewed against an independent release/part
inventory, not self-declared from whatever files happen to be present. This initial in-memory
stage refuses more than 100 MiB of CSV; it is not a gigabyte archive importer. A production-scale
out-of-core stage and bounded snapshot acquisition protocol are still needed.

The local baseline contains all normalized province rows, original D1 IDs and any previously
verified source IDs, legacy mappings, completeness evidence, vintage and existing city completion
claims. Use `""` for a normalized missing postal value, including exported legacy SQL `NULL`s.
Do not label a partial FSA export as a complete province snapshot. No automatic remote exporter
is supplied. A future acquisition design must reserve its reads before queries and establish
freshness/concurrency, rather than silently scanning the production address table.

Identity review modes are `unverified`, `same-vintage` (the two vintages must actually match),
and `reviewed-cross-vintage`; the latter requires specific evidence. The planner does not guess
identity from address text, location GUID, city name, row order or a newly assigned D1 ID.

## Movement, deletions, aggregates and provenance

Changes are assigned to their **old** partition when the address already exists. Moving an
address from M5V to M5G is one update owned by M5V, not an independent delete/add pair. A plan
for M5G alone blocks if the required old owner is outside the selected partitions. Include all
involved owners (including `NO_POSTAL`) to reconcile the move in the same immutable plan.

Deletion requires complete normalized source evidence and reviewed identity. A normalized
replacement count below 50% adds a shrink blocker; `--shrink-review evidence` records an explicit
review of genuine removals/moves. It cannot override rejected records, incomplete inputs or
unverified identity. There is no force flag and no partial-source deletion mode.

Postal groups touched by **both old and new rows** are recomputed. A postal code with no final
backing rows has an explicit `delete` aggregate, avoiding stale removed-postal centroids. City
and street counts/centroids/ranges use the whole local resulting snapshot, including unselected
FSAs. Missing-postal rows still participate in city/street aggregates. Suggest/FTS rebuilding
remains an explicit unbounded production prerequisite, not a swallowed warning followed by a
completion claim.

Local provenance records the address GUID, old/new partition and target vintage; per-FSA coverage
ties normalized counts to the manifest. The planner never writes remote seen markers and never
marks a city complete. Existing `nar_city_imports` claims must be reconciled rather than scheduled
as new work. The June 2026 production ledger observed on 2026-10-15 claims Toronto (1,314,971),
Montreal (658,024) and Calgary (581,332) complete; these are ledger claims, not address recounts.
Carry these claims into any future reviewed baseline.

`fsaSelect` uses `province = ? AND postal_code >= ? AND postal_code < ?`; `NO_POSTAL` uses
separate indexed NULL and empty-string probes. Local SQLite `EXPLAIN QUERY PLAN` tests confirm
`idx_oda_postal` use without an address-table scan. No `SUBSTR`/`COALESCE` is applied to indexed
columns. This verifies the local schema/query shape, not production D1 cardinality or cost.

## Reservation/checkpoint groundwork

`scripts/lib/nar-rehearsal.ts` is deliberately exposed only as a **local-test transport contract**.
The SQLite test adapter commits effects and a stable payload-hash receipt in one transaction.
The journal reserves the full supplied upper bound before each mutation, separately reserves
receipt reads, never refunds reservations, persists attempts and requires identical plan, batch
payloads and ceilings on restart. Every retry costs another reservation. A lost acknowledgement
requires receipt reconciliation before any replay; unknown status stops safely. Completion is
written only after every batch (including derived/provenance batches) is acknowledged. Metadata
overruns permanently block the checkpoint rather than silently assuming the estimate was safe.

An atomic local lock is keyed to the canonical target file, so another output directory or symlink
cannot bypass it. It never steals a stale-looking lock. Following a process crash, verify that no
writer survives and reconcile the local target before manually releasing that lock. This is not
distributed production protection. A future production writer needs a single-writer/fencing and
atomic receipt protocol plus calibrated D1 bounds for **all** effects, retries and reconciliation.
The local logical test costs are not measured D1 metadata and do not establish those bounds.

## Budget evidence and next production gate

Read-only observations on 2026-10-15: `oda-addresses` was 3,956,609,024 bytes. Account analytics
for October 1–15 UTC (October 15 partial) reported 38,129,907,319 reads and 1,619,782 writes;
`ontario-newswatch` accounted for 38,108,145,594 reads and 1,575,199 writes. ODA accounted for
19,167,663 reads and zero writes. Billing/subscription APIs returned 403; plan, cycle and remaining
included allowance are unknown. No billing-denied endpoint was retried or circumvented here.

The proposed pilot ceilings remain **100,000 total writes and 1,000,000 total reads**, including
derived work, retries, provenance, receipts, locks and snapshot reads. They are configurable
local planning inputs, not evidence of account allowance or a production spending guarantee.
Before a production pilot: validate real identity/completeness, design acquisition and distributed
fencing, calibrate complete D1 cost bounds, implement row/FSA runtime provenance and atomic
completion, then separately authorize the reviewed pilot. No production pilot has been run.
