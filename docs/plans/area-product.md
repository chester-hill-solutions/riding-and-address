# Area product — W0 definition

**Status: DRAFT for owner approval.** This is the W0 gate from
[`docs/ops/agent-first-product-plan.md`](../ops/agent-first-product-plan.md): W7–W9 (riding-bounded
search, arbitrary-polygon search, and their limits) **cannot start** until the owner approves the
record type, source, rights, attribution, allowed use, retention, and the initial billable unit
below.

The owner's approval is the deliverable. Nothing here authorizes exposing or charging for a record
set. The licence items in [`docs/legal/licence-checklist.md`](../legal/licence-checklist.md) are
still unchecked (☐) and gate the first paid release.

## The decision, in one line

An **area query returns civic address points** — the same ODA/NAR address records CanCoder already
geocodes with — **selected by which boundary polygon contains them**, and **nothing else**.

## 1. The record

One area result is one **civic address point**:

| Field | Source | Notes |
|---|---|---|
| `civicNumber`, `streetName`, `streetType`, `streetDirection` | ODA / NAR | Canada Post mailing form, matching what a caller types |
| `unit` | ODA / NAR | Absent when the source has none |
| `city`, `province`, `postalCode` | ODA / NAR | |
| `lat`, `lon` | ODA / NAR | WGS84 (EPSG:4326) |
| `dataSource`, `dataVintage` | import metadata | `ODA` or `NAR`, per city — provenance is per record, not per province |
| `riding` | boundary dataset | containing riding id, name, `datasetId`, `datasetYear` |

**Not in scope, and must not be added without a new W0:**

- property, parcel, or lot data; assessed value; building attributes;
- owner or occupant names, phone numbers, or any people-finding data;
- voter, consumer, or business-registry data;
- anything merged or linked for the purpose of identifying a person or organization.

The plan is explicit that address autocomplete and riding boundary polygons are **not** a property
inventory, and CanCoder holds no property listing data. The area product is an address-point export,
not a listings product.

## 2. Sources and rights

| Dataset | Used for | Licence | Commercial use | Attribution |
|---|---|---|---|---|
| Statistics Canada **ODA** v1.0 (2021001) | address points (10 provinces) | [Open Government Licence – Canada 2.0](https://open.canada.ca/en/open-government-licence-canada) | **Yes** — "worldwide, royalty-free, perpetual, non-exclusive … including for commercial purposes" | required |
| Statistics Canada **NAR** (cat. 46-26-0002, current 2026-06-26) | address points, city-by-city replacement | [Statistics Canada Open Licence](https://www.statcan.gc.ca/en/reference/licence) | **Yes** — "use, reproduce, publish, freely distribute, or sell … Value-added Products" | required |
| Federal + provincial/territorial **riding boundaries** | riding id/name per record | Elections Canada; provincial commissions; [DGEQ open data user licence](https://dgeq.org/en/licence.html) | per source | required, per source |

Both address licences permit selling derived products. Both attach conditions that bind the product,
not just the importer:

- **Attribution** is mandatory (§4).
- **No identity resolution.** The Statistics Canada Open Licence forbids merging or linking the
  Information with any other database *"for the purpose of attempting to identify an individual
  person, business or organization"*, and forbids presenting it as if you hold identifiable
  information about a person or business. The OGL–Canada excludes Personal Information outright.
- **No endorsement.** Neither licence permits implying Statistics Canada, the Government of Canada,
  or any electoral body endorses CanCoder.
- **No official symbols** (names, crests, logos, wordmarks) without written authorization.

**Coverage gap:** Newfoundland and Labrador, Nunavut, and Yukon have **no ODA/NAR address data**
(see [`docs/oda-data-import.md`](../oda-data-import.md)). Area queries in those jurisdictions must
return an explicit *no address coverage* result, never an empty set that reads as "no addresses
here".

**Dependency:** ODA is the 2021 collection; NAR is the current source and migrates city by city.
Every record's vintage is reported, and a requested vintage that is unavailable fails hard rather
than silently substituting (dataset-pin rule, ADR 0004).

## 3. Allowed use

Permitted: any lawful use of address points and their containing riding, including redistribution
and resale as a Value-added Product.

Prohibited, and enforced in buyer-facing terms:

- identity resolution, people-finding, skip-tracing, or re-identification;
- merging or linking the records with other databases to identify a person or organization;
- presenting results as Statistics Canada- or government-endorsed;
- using the records to breach any law.

## 4. Attribution

Machine-readable in every area result, and in buyer-facing terms:

- ODA: `Contains information licensed under the Open Government Licence – Canada.`
- NAR: `Adapted from Statistics Canada, National Address Register, 2026-06-26. This does not constitute an endorsement by Statistics Canada of this product.`
- Boundaries: the per-dataset attribution recorded with each boundary source (Elections Canada,
  provincial commissions, DGEQ).

The result envelope carries an `attribution` array so an agent can reproduce the notices without
scraping the API docs.

## 5. Retention

- The compiled address table and derived indexes are retained for the life of the licence.
- No personal information is collected or stored, because none is licensed to us.
- On licence termination, distribution of new results stops; already-ordered Value-added Products
  may still be delivered, per the Statistics Canada Open Licence term.
- Quote and offer records (boundary input, scope, price, result count) are retained for billing
  reconciliation; they carry no personal information.

## 6. Buyer-facing terms (draft clauses)

- The service returns address points, not property or occupant data.
- Results are `as is`, with no warranty, and are not certified by Canada Post or Statistics Canada.
- Attribution notices are supplied with every result and must be preserved on redistribution.
- Prohibited uses (§3) are contract terms, not merely guidance.

## 7. Initial billable unit — recommended

The plan requires a **distinct** area unit and cap, and explicitly says **not** to infer a
large-query price from the point-lookup Billable unit.

**Recommendation:**

- **Unit:** one **area unit** = one fulfilled area query returning **up to 250 records**.
- **Cap:** `maximumResults = 250`, enforced. A request whose exact or estimated count exceeds the
  cap is **rejected**, not metered, in v1.
- **Price:** **$2.00 USD per area unit** (recommended). This is a deliberate premium over the
  point-lookup rate — 250 records at the point unit ($0.005) would be $1.25, which the plan's offer
  sketch uses as the *floor*, not the price. The owner sets the final number.
- **Billing basis:** the accepted offer's `maximumResults` and price ceiling, per the plan's
  quote-and-accept contract. Charged once per fulfilled offer; a retry with the same idempotency
  key never charges twice.

Rationale: bounded and predictable (a buyer always knows the maximum), priced as a bulk data
product rather than 250 point lookups, and enforceable without metering machinery.

**Open alternative for the owner:** per-returned-record pricing (e.g. $0.008/record, min 1 unit).
Rejected as the default only because it makes the maximum charge depend on the data rather than the
accepted offer.

## 8. Limits (feeds W7/W8, not fixed here)

Per the plan, these must be set from source constraints and benchmarks and never left unlimited:
geometry (vertices, area), result count, response size, compute time, and maximum spend. W7 owns the
exact numbers; W0 fixes only `maximumResults = 250` for v1.

## 9. What still needs the owner's signature

1. **Approve the record type** — civic address points, and the explicit exclusions in §1.
2. **Clear the licence items** in [`licence-checklist.md`](../legal/licence-checklist.md) — ODA,
   NAR, and each boundary source — with the product addendum covering attribution and metering.
3. **Confirm the coverage-gap behaviour** for NL/NU/YT.
4. **Set the price** for the area unit (recommendation: $2.00 / 250 records).
5. **Confirm retention** on licence termination.

## 10. What approval unblocks

W7 (area-query geometry and record semantics) and then W8 (riding-bounded estimate and paged
search), which are the last items before the agent journey can quote and retrieve records.
