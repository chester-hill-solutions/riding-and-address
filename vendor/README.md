# CHS utility packages

Built from [CHS commit 4b031bb](https://github.com/chester-hill-solutions/chester-hill-solutions/commit/4b031bb733ee222d0e79600c0b29ce40d2244d92).
Validation 0.3.0 includes the shared Canadian address normalization contract and fixtures; HTTP
0.1.0 and errors 0.1.0 are unchanged upstream packages. Source changes belong in the CHS repo.

These versioned builds let local and CI installs work without private registry credentials, following
the portal's existing auth-package practice. Build each package in the canonical checkout, copy its
`dist`, README and package manifest, remove development/build scripts from the vendored manifest,
and rewrite workspace dependencies to sibling `file:../<name>` references. Keep this provenance
updated when refreshing. Never patch generated files here.

The root and portal resolve the same validation build. API wrappers retain CanCoder statuses,
error codes, international postal fallback, CORS, security headers and correlation IDs.
