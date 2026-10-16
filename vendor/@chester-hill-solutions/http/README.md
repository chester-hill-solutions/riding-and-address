# @chester-hill-solutions/http

JSON API responses, request parsing, and session header merging for React Router / Fetch handlers.

**Install:** [docs/USING-PACKAGES.md](../../docs/USING-PACKAGES.md)

```bash
bun add @chester-hill-solutions/http@^0.1.0
```

**Depends on:** `@chester-hill-solutions/errors`, `@chester-hill-solutions/validation`, `zod`.

## Example

```typescript
import { jsonOk, jsonError, getSortParams } from "@chester-hill-solutions/http";
import { formatApiError } from "@chester-hill-solutions/errors";

export async function loader({ request }: Route.LoaderArgs) {
  const { sort, order } = getSortParams(request);
  try {
    const rows = await loadRows({ sort, order });
    return jsonOk({ rows });
  } catch (error) {
    return jsonError({ error: formatApiError(error) }, { status: 500 });
  }
}
```

## Main exports

| Area | Exports |
|------|---------|
| Responses | `jsonOk`, `jsonError`, `redirectTo`, `mergeSessionHeaders` |
| Body / API | `parseJsonBodyWithSchema`, `validateRequiredFields` |
| Request | `getPaginationParams`, `getSortParams`, `getSearchTerm`, `getStringField`, … |

## Develop in this repo

```bash
bun run --cwd packages/http test
bun run --cwd packages/http build
```
