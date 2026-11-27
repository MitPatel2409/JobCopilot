/**
 * The background loops. One tick a minute, while the server runs:
 *
 *   1. Due reminders  → pushed to their open browser tabs (browser notification).
 *   2. Daily digest   → one email at their digest hour with what's due, when Gmail sending is connected.
 *   3. Evening nudge  → at their nudge hour, if nothing was logged today, ask what they did.
 *   4. Recruiter mail → every 15 minutes, when Gmail reading is connected (gmail/replyWatcher.js).
 *   5. Résumé folder  → every tick, when a folder is set in Settings (resumeFolderService.js).
 *
 * Reminders that came due while the server was off fire on the first tick.
 * The digest and nudge record the day they ran in `meta`, so a restart
 * does not repeat them.
 */
const { localHour } = require("../../utils/time");
const { checkReplies } = require("../gmail/replyWatcher");
const { buildDigest } = require("./digest");
const { scan: scanResumeFolder } = require("../resumeFolderService");

const TICK_MS = 60 * 1000;

function createScheduler(app, { intervalMs = TICK_MS } = {}) {
  let timer = null;
  let running = false;

  async function tick() {
    if (running) return; // a slow digest send must not overlap the next tick
    running = true;
    try {
      await tickForOwner(app.forUser(app.users.owner()), app.clock());
    } finally {
      running = false;
    }
  }

  const safeTick = () => tick().catch((error) => console.error("Scheduler tick failed:", error));

  return {
    tick,
    start() {
      safeTick();
      timer = setInterval(safeTick, intervalMs);
    },
    stop() {
      clearInterval(timer);
    },
  };
}

async function tickForOwner(ctx, now) {
  notifyDueReminders(ctx, now);
  await sendDigestIfDue(ctx, now);
  nudgeIfDue(ctx, now);
  try {
    await checkReplies(ctx, now);
  } catch (error) {
    console.error(`Checking Gmail for replies failed: ${error.message}`);
  }
  try {
    await scanResumeFolder(ctx);
  } catch (error) {
    console.error(`Checking the résumé folder failed: ${error.message}`);
  }
}

function notifyDueReminders(ctx, now) {
  for (const reminder of ctx.store.reminders.dueUnnotified(now.toISOString())) {
    const updated = ctx.store.reminders.update(reminder.id, { notified_at: now.toISOString() });
    ctx.publish({ type: "reminder_due", reminder: updated });
  }
}

async function sendDigestIfDue(ctx, now) {
  if (!ctx.mailer || !ctx.config.digestEnabled) return;
  const today = ctx.today();
  if (localHour(now, ctx.config.timezone) < ctx.config.digestHour) return;
  if (ctx.store.meta.get("digest_sent_on") === today) return;

  // Mark the day first, so a failing mail server is not retried every minute.
  ctx.store.meta.set("digest_sent_on", today);
  const digest = buildDigest(ctx, now);
  if (!digest) return;

  try {
    await ctx.mailer.send(digest);
  } catch (error) {
    console.error(`Daily digest email failed: ${error.message}`);
  }
}

function nudgeIfDue(ctx, now) {
  const today = ctx.today();
  if (localHour(now, ctx.config.timezone) < ctx.config.nudgeHour) return;
  if (ctx.store.meta.get("nudge_sent_on") === today) return;

  ctx.store.meta.set("nudge_sent_on", today);
  if (!ctx.store.journal.get(today)) {
    ctx.publish({ type: "nudge", message: "Nothing logged today yet. What did you work on?" });
  }
}

module.exports = { createScheduler };
