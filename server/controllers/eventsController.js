/**
 * GET /events: a Server-Sent Events stream of what the background loops
 * publish (reminder_due, nudge, mail_matches, data_changed) for the signed-in
 * user. The browser turns
 * reminder_due into a desktop notification.
 */
const HEARTBEAT_MS = 25 * 1000;

exports.stream = (req, res) => {
  const ctx = req.ctx;

  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  res.write(": connected\n\n");

  // One emitter serves every user; each stream only passes on its own user's events.
  const send = ({ userId, ...event }) => {
    if (userId === ctx.user.id) res.write(`data: ${JSON.stringify(event)}\n\n`);
  };
  // A comment line now and then stops proxies from closing an idle stream.
  const heartbeat = setInterval(() => res.write(": ping\n\n"), HEARTBEAT_MS);

  ctx.events.on("event", send);
  req.on("close", () => {
    clearInterval(heartbeat);
    ctx.events.off("event", send);
  });
};
