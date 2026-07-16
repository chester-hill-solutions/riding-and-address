# Vendored `@chester-hill-solutions` packages

These packages are vendored so the portal installs in CI and Cloudflare builds without a sibling
`chester-hill-solutions` checkout or GitHub Packages `write:packages` publish.

Commit **`dist/`** with each package (the root `.gitignore` only ignores `/dist/` at the
repo root). CI typecheck fails if only `package.json` is present.

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
# rewrite workspace deps to file:../auth as needed, then npm install in portal/
```

Prefer publishing to GitHub Packages (see `portal/.npmrc`) when `write:packages` is available,
then switch `portal/package.json` to semver ranges and remove this vendor tree.
