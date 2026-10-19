/**
 * How long an access token lives.
 *
 * One place, because two things depend on it and they must not disagree: the authorization
 * server's configuration, which mints the token, and the consent screen, which tells a person
 * how long they are agreeing for. A screen that says "an hour" while the server issues tokens
 * that last ten minutes is a lie that only shows up in a support ticket.
 *
 * The value is set **explicitly** rather than left to the provider's default. The default is the
 * same number today, but a default nobody wrote down is a number nobody can point at when the
 * consent screen has to state it.
 */
export const ACCESS_TOKEN_LIFETIME_SECONDS = 3600;

/** The same lifetime in minutes, for the consent screen. */
export const ACCESS_TOKEN_LIFETIME_MINUTES = ACCESS_TOKEN_LIFETIME_SECONDS / 60;
