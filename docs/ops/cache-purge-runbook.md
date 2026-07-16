# Cache purge runbook (boundary cutover)

Use when replacing riding GeoJSON in R2 so edge caches and warm keys do not serve stale polygons.

## Steps

1. **Upload** new GeoJSON with the target R2 key (same key replaces object):

   ```bash
   npm run upload:r2-datasets -- --remote
   # or scripts/upload-r2-datasets.ts for a single key
   ```

2. **Verify** object exists (Worker health / dataset check or `wrangler r2 object get`).

3. **Purge lookup caches** for affected coordinate/postal keys:
   - Delete or version `LOOKUP_CACHE` KV keys for the dataset path, **or** redeploy with a cache namespace bump if you keep path-scoped keys.
   - Clear `GEOCODING_CACHE` only if geocoding behaviour changed (usually unnecessary for boundary-only updates).

4. **Warm** critical keys (cron runs every 6 hours; optional manual):

   ```bash
   curl -X POST "$WORKER_URL/admin/cache/warm" # if operator route enabled
   # else wait for cron: 0 */6 * * *
   ```

5. **Smoke test** with pin:

   ```bash
   curl "$WORKER_URL/api/federal?lat=45.4215&lon=-75.6972&dataset=federalridings-2024.geojson" \
     -H "Authorization: Bearer $SERVER_KEY"
   ```

   Expect `dataset.id` / `dataset.year` in the JSON body. Wrong pin → `DATASET_UNAVAILABLE`.

6. **Changelog** — append a row to [docs/DATASET_CHANGELOG.md](../DATASET_CHANGELOG.md).

## Notes

- No dual-serve: only the current object at each R2 key is live.
- Customer pin hard-fail is intentional so redistributions cannot silently change results.
