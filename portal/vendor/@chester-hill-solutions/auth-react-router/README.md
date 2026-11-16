# @chester-hill-solutions/auth-react-router

React Router 7 loaders for session enforcement and auth layout data.

**Install:** [docs/USING-PACKAGES.md](../../docs/USING-PACKAGES.md)

```bash
bun add @chester-hill-solutions/auth@^0.14.0 @chester-hill-solutions/auth-postgres@^0.14.0 @chester-hill-solutions/auth-react-router@^0.14.0
```

**Peers:** `react-router` ^7.x

**Version:** keep aligned with `auth` and `auth-postgres`.

## Example

```typescript
import { createRequireSessionUserId, createAuthLayoutLoader } from "@chester-hill-solutions/auth-react-router";
import { session } from "./auth.server";

export const requireSessionUserId = createRequireSessionUserId({
  getSessionUserId: session.getSessionUserId,
  loginUrlWithContinue: (req) => `/auth/login?continue=${encodeURIComponent(req.url)}`,
});

export const authLayoutLoader = createAuthLayoutLoader({
  getSessionUser: session.getSessionUser,
  loginUrlWithContinue: (req) => `/auth/login?continue=${encodeURIComponent(req.url)}`,
});
```

## Main exports

`createRequireSessionUserId`, `createGetSessionUserIdOrNull`, `createAuthLayoutLoader`

## Develop in this repo

```bash
bun run --cwd packages/auth-react-router test
bun run --cwd packages/auth-react-router build
```

## Capability & invite helpers (0.2.0+)

- `createRequireCapability` — actor-aware capability gate returning Response on deny
- `createInviteCompletionLoader` — verified-email binding for invitation acceptance flows

## API-key guards (0.3.0+)

- `createRequireApiKeyActor` — Bearer/x-api-key extraction → `verifyApiKey` → workspace-bound `ApiKeyAuthorizationActor` (401 unknown, 403 tenant mismatch); compose with `createRequireCapability` for capability checks
