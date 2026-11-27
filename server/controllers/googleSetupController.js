/**
 * Setting up the Google OAuth client from Settings, so connecting Calendar
 * and Gmail needs no .env editing and no restart. The secret is stored
 * encrypted. GOOGLE_CLIENT_ID/SECRET in .env, when set, take precedence.
 */
const args = require("../utils/args");
const { ValidationError } = require("../utils/errors");

const CLIENT_ID = /^[\w-]+\.apps\.googleusercontent\.com$/;

/** Whether a client is set up, where it came from, and what to paste into Google Cloud. */
exports.get = (req, res) => {
  const app = req.ctx.app;
  const google = app.google();
  res.json({
    configured: app.oauth.configured,
    source: google.source,
    clientId: google.clientId || null,
    redirectUri: google.redirectUri,
    javascriptOrigin: new URL(google.redirectUri).origin,
  });
};

exports.save = async (req, res) => {
  const app = req.ctx.app;
  if (app.google().source === "env") throw new ValidationError("The Google client is set in server/.env. Change it there.");
  if (!app.vault) throw new ValidationError("The server has no APP_SECRET to encrypt the client secret with.");

  const body = req.body ?? {};
  const clientId = args.text(body, "client_id", { required: true, max: 200 });
  const clientSecret = args.text(body, "client_secret", { required: true, max: 200 });
  if (!CLIENT_ID.test(clientId)) throw new ValidationError("That doesn't look like a Client ID: it ends in .apps.googleusercontent.com.");
  if (/\s/.test(clientSecret) || clientSecret.length < 10) throw new ValidationError("That doesn't look like a Client secret (it usually starts with GOCSPX-).");

  // A token from another client can't be used with this one.
  if (app.google().clientId && app.google().clientId !== clientId) await forgetConnection(app, req.user.id);
  app.users.update(req.user.id, { google_client_id: clientId, google_client_secret: app.vault.encrypt(clientSecret) });
  app.connectors?.forget(req.user.id);
  exports.get(req, res);
};

/** Removes the client pasted into Settings, and the connection made with it. */
exports.remove = async (req, res) => {
  const app = req.ctx.app;
  if (app.google().source === "env") throw new ValidationError("The Google client is set in server/.env. Remove it there.");
  await forgetConnection(app, req.user.id);
  app.users.update(req.user.id, { google_client_id: null, google_client_secret: null });
  app.connectors?.forget(req.user.id);
  res.status(204).end();
};

async function forgetConnection(app, userId) {
  const token = app.googleTokens.get(userId);
  if (!token) return;
  try {
    await app.oauth.revoke(app.vault.decrypt(token.refresh_token));
  } catch (error) {
    console.warn(`Revoking the Google token failed: ${error.message}`);
  }
  app.googleTokens.delete(userId);
}
