# Vendored CHS auth packages

The portal keeps directory delivery so CI and Cloudflare builds need no sibling checkout or private registry credential. Built JavaScript and declarations are committed.

| Package | Version |
|---|---|
| auth | 0.15.0 |
| auth-d1 | 0.11.1 |
| auth-react-router | 0.15.0 |
| app-origin | 0.2.0 |

Source: CHS commit `3dba6c56bc50cb89bca0346e211329c1fb7e1885`. [chs-packages.json](chs-packages.json) records canonical tarball SHA-256 receipts and each delivered file hash. Only package manifests change for delivery: scripts/devDependencies are removed, and internal dependencies become sibling `file:` references. Never patch generated runtime files here.

The prior `6c64aeb099de` auth-D1 refresh's twelve OAuth foreign keys remain present. Every old dist path remains in the new canonical payload; auth-react-router's runtime/declaration files are already byte-identical. OAuth plugin subpaths remain separate, and the app's already-coherent BetterAuth/adapter/MCP/OAuth/CIMD 1.7.14 family is retained.

## File-package lock snapshots and runtime closure

The portal explicitly installs app-origin at its root as well as declaring auth's internal dependency. Native imports from vendored source and installed SDK contexts must all resolve a complete closure. TypeScript path aliases and a successful bundle alone do not prove that.

A plain `bun install` can copy refreshed file-package payloads while retaining old dependency metadata. Refresh all four file targets together, then inspect the lock diff:

```sh
# From portal/, using the same Bun 1.4.3 as current CI
bun update @chester-hill-solutions/auth @chester-hill-solutions/auth-d1 @chester-hill-solutions/auth-react-router @chester-hill-solutions/app-origin --ignore-scripts
bun install --frozen-lockfile --ignore-scripts
bun run check:chs-packages
```

With a populated cache, `--offline` also works. Avoid broad forced updates or deleting the lock: retain unrelated external resolutions. Repeat verification after a clean node_modules install. The gate checks delivered/installed payloads, native compiled-JS imports from every auth consumer, and the existing auth-engine peer family; it rejects missing dependencies or empty shadows. Source packages remain canonical in CHS.

The API's utility vendors remain unchanged: their dist hashes already match the current canonical validation 0.3.0, HTTP 0.1.0 and errors 0.1.0 builds.

See the [host contracts and migration checklist](../../docs/ops/chs-auth-upgrade.md) before rollout.
