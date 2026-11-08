# @chester-hill-solutions/app-origin

The public origin of a deployed application, and the origins that a redirect may use.

## Why

A deployed application must know its own public address. A browser sends that address in the
`Origin` header of every request that changes state, and a request with a different origin must be
refused. The application also sends absolute links, for example in an email, and a link must not
leave the origin that the browser trusts.

The address is not the same on every host. Railway publishes the public domain as a host name
without a scheme, so the scheme must be added. A host behind a proxy states the address that the
browser sees. A trailing slash must be removed, because a browser sends the origin without one.

## What it does

- `appPublicOrigin()` returns the public origin, or an empty string when no host has configured one.
  It reads `RAILWAY_PUBLIC_DOMAIN` first, and then `APP_PUBLIC_ORIGIN`.
- `authTrustedOrigins(fallback)` returns the origins that a redirect may use. It holds the public
  origin and the origins of `APP_TRUSTED_ORIGINS`, and each origin appears once.
- `absoluteAppUrl(request, pathname)` returns an absolute address of the application. It uses the
  configured public origin and throws `MissingPublicOriginError` when none is configured. It
  resolves the path against that origin and throws `TypeError` if the path leaves it.

The package reads the environment of the host. It holds no server framework, no database and no
application state, so a host can use it in any runtime that runs Node.

## The origin subpath in the auth package

The `auth` package serves these three functions from its `origin` subpath. It re-exports them from
this package, so the two cannot drift apart. The subpath stays so that the existing consumers of
`@chester-hill-solutions/auth/origin` keep working.

## Use

```ts
import { appPublicOrigin } from '@chester-hill-solutions/app-origin';

const origin = appPublicOrigin();
```

### Security boundary in 0.2

`absoluteAppUrl` requires a configured public origin and never trusts the incoming request's
origin. It resolves the pathname and checks that the result retains the configured origin;
protocol-relative, backslash and whitespace authority escapes throw `TypeError`. Ordinary
same-origin paths, including `/members//42`, remain valid. This carries the origin-preservation
portion of PR #177; its OAuth conformance changes remain separate.
