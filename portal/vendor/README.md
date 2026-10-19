# Vendored `@chester-hill-solutions` packages

These packages are vendored so the portal installs in CI and Cloudflare builds without a sibling
`chester-hill-solutions` checkout or GitHub Packages `write:packages` publish.

Commit **`dist/`** with each package (the root `.gitignore` only ignores `/dist/` at the
repo root). CI typecheck fails if only `package.json` is present.

**Vendored from CHS main at `6c64aeb099de`** — `auth` 0.5.0, `auth-d1` **0.7.1**,
`auth-react-router` 0.3.0. All three now correspond to that one commit: `diff -rq` reports no
differing files for `auth` and `auth-react-router`, so only `auth-d1` needed copying.

`auth-d1` 0.7.1 splits the plugin entry points. `./plugins` is `magicLink` and `jwt` only, with
`mcp`, `oauthProvider` and `cimd` behind `./plugins/mcp`, `./plugins/oauth-provider` and
`./plugins/cimd`. That is what `peerDependenciesMeta` always claimed: those three come from
`@better-auth/*` packages that are optional peers, and re-exporting them from the root entry point
made them mandatory for every consumer. **The portal import changed with it** — `mcp` now comes from
`@chester-hill-solutions/auth-d1/plugins/mcp`.

It also carries the twelve foreign keys in `OAUTH_DDL`, which had been sitting on
`fix/oauth-ddl-foreign-keys` and **never merged** (CHS #166). That is how the gap was found: a
refresh taken from main first would have silently reverted them. **Check `grep -c REFERENCES
dist/oauth-sql.js` returns 12** — the number is the whole point of the file, and nothing in the
portal's build would notice if it were zero.

That refresh carried more than the OAuth tables: the packages had been four minor versions behind,
so `auth/testing` (the dialect conformance runners), `auth/product-roles`, and
`auth-react-router/api-key` arrive with it.

The refresh also moved `better-auth` to `^1.7.10` and `@better-auth/drizzle-adapter` to
`^1.7.10`, because the vendored `auth-d1` peers require it. **`portal/bun.lock` had to be
regenerated rather than updated**: it still recorded the previous vendored manifest — a
`better-auth ^1.6.0` peer and devDependencies that no longer exist — so `bun install` kept
resolving a second, stale `better-auth@1.6.23` nested under the vendored package. Two copies is not
a warning here: it makes `getAuth`'s inferred type unnameable and the portal typecheck fails with
TS2742.

Source of truth remains the CHS monorepo. To refresh after upstream changes:

```bash
# from ridingLookup/
for pkg in auth auth-d1 auth-react-router; do
  (cd ../chester-hill-solutions/packages/$pkg && bun run build)
  rm -rf portal/vendor/@chester-hill-solutions/$pkg
  mkdir -p portal/vendor/@chester-hill-solutions/$pkg
  cp ../chester-hill-solutions/packages/$pkg/package.json portal/vendor/@chester-hill-solutions/$pkg/
  cp -R ../chester-hill-solutions/packages/$pkg/dist portal/vendor/@chester-hill-solutions/$pkg/
done
# rewrite workspace deps to file:../auth as needed, then bun install in portal/
```

Prefer publishing to GitHub Packages (see `portal/.npmrc`) when `write:packages` is available,
then switch `portal/package.json` to semver ranges and remove this vendor tree.
