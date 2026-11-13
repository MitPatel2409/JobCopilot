/**
 * Google services linked to the signed-in account. Connecting goes through
 * GET /auth/google/connect/:connector (Google's consent page); these routes
 * list them and switch them off.
 */
const { CONNECTORS } = require("../services/auth/googleOAuth");
const { NotFoundError } = require("../utils/errors");

exports.list = (req, res) => {
  const app = req.ctx.app;
  const token = app.googleTokens.get(req.user.id);

  res.json({
    available: app.oauth.configured && Boolean(app.vault),
    account: token ? req.user.email : null,
    error: token?.last_error ?? null,
    connectors: Object.entries(CONNECTORS).map(([id, { label, scope }]) => ({
      id,
      label,
      connected: Boolean(token?.enabled.includes(id) && token.scopes.includes(scope)),
    })),
  });
};

/** Stops using one service. When none is left, the app's access to the Google account is withdrawn. */
exports.disconnect = async (req, res) => {
  const app = req.ctx.app;
  const name = req.params.name;
  if (!CONNECTORS[name]) throw new NotFoundError(`There is no "${name}" connector.`);

  const token = app.googleTokens.get(req.user.id);
  if (token) {
    const enabled = token.enabled.filter((id) => id !== name);
    if (enabled.length > 0) {
      app.googleTokens.setEnabled(req.user.id, enabled);
    } else {
      try {
        await app.oauth.revoke(app.vault.decrypt(token.refresh_token));
      } catch (error) {
        console.warn(`Revoking the Google token failed: ${error.message}`); // already revoked, or Google is unreachable
      }
      app.googleTokens.delete(req.user.id);
    }
    app.connectors?.forget(req.user.id);
  }
  res.status(204).end();
};
