/**
 * Google OAuth for the connectors (Calendar, Gmail): the consent link for
 * the services the owner picked, and reading what Google sends back. There
 * is no sign-in; the identity scopes only tell Settings which account is
 * connected.
 *
 * The OAuth client (ID and secret) comes from `getGoogle()` on every call,
 * so one pasted into Settings works at once, without a restart.
 */
const { auth } = require("@googleapis/calendar");

const IDENTITY_SCOPES = ["openid", "email", "profile"];

/** The connectors and the Google permission each one needs. */
const CONNECTORS = {
  calendar: { label: "Google Calendar", scope: "https://www.googleapis.com/auth/calendar.events" },
  gmail_send: { label: "Daily digest from your Gmail", scope: "https://www.googleapis.com/auth/gmail.send" },
  gmail_drafts: { label: "Save drafts to Gmail", scope: "https://www.googleapis.com/auth/gmail.compose" },
  gmail_read: { label: "Notice recruiter replies", scope: "https://www.googleapis.com/auth/gmail.readonly" },
};

function createOAuthClient({ clientId, clientSecret, redirectUri }) {
  return new auth.OAuth2(clientId, clientSecret, redirectUri);
}

function createGoogleOAuth(getGoogle) {
  const client = () => createOAuthClient(getGoogle());

  return {
    get configured() {
      const google = getGoogle();
      return Boolean(google.clientId && google.clientSecret);
    },

    /**
     * Asks, on one consent screen, for the permissions of `connectors` on top
     * of what was granted before. `prompt: consent` makes Google return a
     * refresh token every time.
     */
    connectUrl(state, connectors) {
      return client().generateAuthUrl({
        scope: [...IDENTITY_SCOPES, ...connectors.map((connector) => CONNECTORS[connector].scope)],
        state,
        access_type: "offline",
        include_granted_scopes: true,
        prompt: "consent",
      });
    },

    /** Trades the code from the redirect for tokens and the verified account they belong to. */
    async exchange(code) {
      const oauth = client();
      const { tokens } = await oauth.getToken(code);
      const ticket = await oauth.verifyIdToken({ idToken: tokens.id_token, audience: getGoogle().clientId });
      const profile = ticket.getPayload();
      if (!profile.email_verified) throw new Error("This Google account's email address is not verified.");
      return {
        tokens,
        scopes: (tokens.scope ?? "").split(" ").filter(Boolean),
        profile: {
          sub: profile.sub,
          email: profile.email.toLowerCase(),
          name: profile.given_name || profile.name || null,
          picture: profile.picture || null,
        },
      };
    },

    /** Withdraws everything the app was granted. */
    async revoke(refreshToken) {
      await client().revokeToken(refreshToken);
    },
  };
}

module.exports = { CONNECTORS, createGoogleOAuth, createOAuthClient };
