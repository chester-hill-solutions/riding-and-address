# @chester-hill-solutions/errors

User-facing error formatters and admin logging helpers for API and server code.

**Install:** [docs/USING-PACKAGES.md](../../docs/USING-PACKAGES.md)

```bash
bun add @chester-hill-solutions/errors@^0.1.0
```

## Example

```typescript
import {
  formatDatabaseError,
  formatApiError,
  logErrorForAdmin,
} from "@chester-hill-solutions/errors";

try {
  await db.query(...);
} catch (error) {
  logErrorForAdmin("contact.load", error);
  return jsonError({ error: formatDatabaseError(error) }, { status: 500 });
}
```

## Main exports

| Export | Use |
|--------|-----|
| `formatDatabaseError` | Postgres/Supabase failures |
| `formatApiError` | Generic API failures |
| `formatValidationError` | Validation failures |
| `formatPermissionError` | Generic permission denial |
| `formatNotFoundError` | Missing resources |
| `logErrorForAdmin` | Structured admin logs |

For CRM-specific permission labels, wrap or extend in the consumer app (e.g. `nes-dashboard` `crm-errors.ts`).

## Develop in this repo

```bash
bun run --cwd packages/errors test
bun run --cwd packages/errors build
```
