# Suggest index staging checklist

Self-serve SKU includes `/api/search` + `/embed.js`. Keep `ODA_SUGGEST_ENABLED=false` until the index is built.

## Checklist

1. Staging D1 `ODA_DB` has imported ODA rows for target provinces.
2. Build suggest index:

   ```bash
   npm run build:oda:suggest -- --provinces ON --remote --env staging
   ```

   (Adjust provinces; expand after ON smoke.)

3. Set staging var `ODA_SUGGEST_ENABLED=true` and redeploy `--env staging`.
4. Smoke with a Browser key:

   ```bash
   curl "$STAGING_URL/api/search?q=main&key=$PK" -H "Origin: https://allowed.example"
   ```

5. Confirm embed script loads and suggests appear.
6. Only then enable suggest on production.

## Notes

- Search successes are Billable units when Customer keys are enabled.
- Portal marketing try-it uses `/embed.js` with `demo: true` (riding via `/api/demo/*`) plus an
  optional `DEMO_BROWSER_API_KEY` for `/api/search` when API_KEYS is enabled.
