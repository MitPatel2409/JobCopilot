/**
 * Google services linked to the signed-in account. Connecting goes through
 * GET /auth/google/connect?services=… (Google's consent page); these routes
 * list them and switch them off.
 */
const { CONNECTORS } = require("../services/auth/googleOAuth");
const { NotFoundError } = require("../utils/errors");
const { sameOffset } = require("../utils/time");

exports.list = async (req, res) => {
  const app = req.ctx.app;
  const token = app.googleTokens.get(req.user.id);

  res.json({
    calendarTimeZone: await calendarZoneMismatch(req.ctx),
    available: app.oauth.configured && Boolean(app.vault),
    source: app.google().source,
    account: token ? req.user.email : null,
    error: token?.last_error ?? null,
    connectors: Object.entries(CONNECTORS).map(([id, { label, scope }]) => ({
      id,
      label,
      connected: Boolean(token?.enabled.includes(id) && token.scopes.includes(scope)),
    })),
  });
};

/**
 * When Google Calendar is set to another timezone than the app, events land
 * at the right moment but Google shows them at a different hour (a 9:00
 * reminder appears at 14:00 on a calendar set to UTC). Returns
 * { calendar, app } so Settings can say how to fix it, else null.
 */
async function calendarZoneMismatch(ctx) {
  if (!ctx.calendar?.timeZone) return null;
  try {
    const zone = await ctx.calendar.timeZone();
    if (!zone || sameOffset(ctx.clock(), zone, ctx.config.timezone)) return null;
    return { calendar: zone, app: ctx.config.timezone };
  } catch {
    return null; // can't tell; never block the Settings page on it
  }
}

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
