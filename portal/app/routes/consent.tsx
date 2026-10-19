import { Button } from '~/components/ui/button';
import { Form, redirect } from 'react-router';
import type { Route } from './+types/consent';
import { getAuth, getSession } from '~/lib/auth.server';
import { CONSENT_DURATION_COPY } from '~/lib/consent-copy';
import { AuthLayout } from '~/components/AuthLayout';

export function meta(): Route.MetaDescriptors {
  return [
    { title: 'Authorise an application · CanCoder portal' },
    {
      name: 'description',
      content: 'Review what an application is asking to do with your CanCoder account.',
    },
  ];
}

/**
 * What each scope actually lets an application do, in the words a person deciding would use.
 *
 * This is where the "area search gets its own scope" decision becomes visible rather than implied.
 * A lookup is half a cent and an area search can be $8, so they are two separate lines here and an
 * application that asked for both has to be seen asking for both. A scope with no entry still
 * renders — with its raw name — because an undescribed scope is more reason to hesitate, not less.
 */
const SCOPE_DESCRIPTIONS: Record<string, string> = {
  'ridings:lookup':
    'Look up which electoral district contains an address, postal code, or coordinates. Charged at the usual per-call rate.',
  'ridings:area':
    'Search and buy address data inside a riding or a shape you provide. Billed per 250 records, up to $8 per search — this is the expensive one.',
  openid: 'Confirm which CanCoder account is signed in.',
  profile: 'Read the name and email on your CanCoder account.',
  offline_access: 'Keep working while you are away, until you revoke it.',
};

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const clientId = url.searchParams.get('client_id');
  const code = url.searchParams.get('code');

  // Better Auth only sends `code` when the authorization request itself was valid, so its absence
  // means there is nothing to consent to rather than something to guess at.
  if (!clientId || !code) {
    return {
      state: 'invalid' as const,
      invalid:
        'This authorisation link is incomplete. Ask the application to start the connection again.',
    };
  }

  const { userId } = await getSession().getSessionUserId(request);
  if (!userId) {
    // Sign in first, then come back to exactly this request. Without the query the user would
    // consent to nothing and the client would have to start over.
    return redirect(`/login?continue=${encodeURIComponent(`${url.pathname}${url.search}`)}`);
  }

  // The client's own name, when it has one. A Client ID Metadata Document publishes it; a
  // pre-registered client has it stored. If neither answers we show the identifier, which for CIMD
  // is the host that published the document — the thing MCP says to display regardless.
  let clientName: string | null = null;
  try {
    const client = await getAuth().api.getOAuthClientPublic({
      query: { client_id: clientId },
      headers: request.headers,
    });
    const name = (client as { name?: string | null } | null)?.name;
    if (typeof name === 'string' && name.trim()) clientName = name.trim();
  } catch {
    // A consent screen that cannot name the client is still worth showing — with the identifier.
  }

  return {
    state: 'ready' as const,
    clientId,
    clientName,
    scopes: (url.searchParams.get('scope') ?? '').split(' ').filter(Boolean),
    oauthQuery: url.search,
  };
}

/**
 * Complete the authorization.
 *
 * The decision is made here and handed to Better Auth's `/oauth2/consent`, which owns what happens
 * next — issuing the code and returning the user to the client's `redirect_uri`. This route does not
 * decide anything about tokens; it forwards a yes or a no and the browser's own session cookies, so
 * the consent is attributed to the signed-in user rather than to whoever called the route.
 */
export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const accept = String(form.get('accept')) === 'true';
  const oauthQuery = String(form.get('oauth_query') ?? '');
  const origin = new URL(request.url).origin;
  const cookie = request.headers.get('cookie');
  // Better Auth's CSRF check runs on any request that carries a cookie, and it needs to know
  // where the request came from. The browser sends `Origin` (and `Referer`); this inner request
  // is built by hand, so without forwarding them the check refuses the consent with
  // `MISSING_OR_NULL_ORIGIN` — and the user is told "Nothing was granted" for a consent that
  // never had a chance. A request with no cookie is exempt, which is why the token endpoint is
  // fine for a native client and this one was not.
  const originHeader = request.headers.get('origin');
  const referer = request.headers.get('referer');

  const response = await getAuth().handler(
    new Request(new URL('/api/auth/oauth2/consent', origin), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(cookie ? { cookie } : {}),
        ...(originHeader ? { origin: originHeader } : {}),
        ...(referer ? { referer } : {}),
      },
      body: JSON.stringify({ accept, oauth_query: oauthQuery }),
    }),
  );

  // Better Auth does not answer this with a 302. It returns **200 with a JSON envelope** —
  // `{"redirect":true,"url":"<client callback>?code=…&state=…&iss=…"}` — and leaving the browser on
  // that JSON is not a redirect at all. The first version of this treated anything that was not a
  // 3xx as a failure, so a consent that had actually succeeded showed the user an error and the
  // client never received its code. Found by walking the flow rather than by reading it.
  if (response.status >= 300 && response.status < 400) return response;

  const envelope = (await response.json().catch(() => null)) as
    | { redirect?: boolean; url?: string }
    | null;
  if (envelope?.redirect && envelope.url) return redirect(envelope.url);

  return {
    error: accept
      ? 'Could not complete the authorisation. Nothing was granted — start again from the application.'
      : 'Could not record the refusal. Nothing was granted either way.',
  };
}

export default function Consent({ loaderData, actionData }: Route.ComponentProps) {
  if (loaderData.state === 'invalid') {
    return (
      <AuthLayout title="Nothing to authorise" description={loaderData.invalid}>
        <p className="muted">You can close this window.</p>
      </AuthLayout>
    );
  }

  const { clientName, clientId, scopes, oauthQuery } = loaderData;
  const shown = clientName ?? clientId;

  return (
    <AuthLayout
      title={`Authorise ${shown}?`}
      description={
        clientName
          ? `An application identified as ${clientId} is asking to use your CanCoder account.`
          : 'An application is asking to use your CanCoder account. It has not given a name, so check the identifier above before continuing.'
      }
    >
      {actionData?.error ? (
        <p className="muted" role="alert">
          {actionData.error}
        </p>
      ) : null}

      <h2>It is asking to:</h2>
      <ul>
        {scopes.map((scope) => (
          <li key={scope}>
            <strong>{SCOPE_DESCRIPTIONS[scope] ?? scope}</strong>
            <br />
            <span className="muted">{scope}</span>
          </li>
        ))}
      </ul>

      <p className="muted">{CONSENT_DURATION_COPY}</p>

      <Form method="post">
        <input type="hidden" name="oauth_query" value={oauthQuery} />
        <Button type="submit" name="accept" value="true">
          Authorise
        </Button>
        <Button type="submit" name="accept" value="false" variant="outline">
          Deny
        </Button>
      </Form>
    </AuthLayout>
  );
}
