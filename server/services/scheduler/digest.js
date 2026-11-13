/**
 * The morning email: reminders due today or overdue, and applications with
 * no news for a while that may be worth marking as ghosted.
 * Returns null when there is nothing to say.
 */
const { addDays, zonedToUtc, formatLocal } = require("../../utils/time");

const STALE_DAYS = 21;

function buildDigest(ctx, now) {
  const { timezone, appUrl } = ctx.config;
  const today = ctx.today();
  const endOfToday = zonedToUtc(addDays(today, 1), 0, 0, timezone).toISOString();

  const due = ctx.store.reminders.listPending({ before: endOfToday });
  const followUps = due.filter((r) => r.kind !== "revision");
  const revisions = due.filter((r) => r.kind === "revision");
  const stale = ctx.store.applications.staleSince(addDays(today, -STALE_DAYS));

  if (due.length === 0 && stale.length === 0) return null;

  const overdue = (r) => (r.due_at < now.toISOString() ? " (overdue)" : "");
  const sections = [];

  if (followUps.length) {
    sections.push({
      title: "Follow-ups and reminders",
      items: followUps.map((r) => ({
        text: `${r.message} — ${formatLocal(r.due_at, timezone)}${overdue(r)}`,
        link: r.url,
      })),
    });
  }
  if (revisions.length) {
    sections.push({
      title: "Revise today",
      items: revisions.map((r) => ({ text: `${r.message}${overdue(r)}` })),
    });
  }
  if (stale.length) {
    sections.push({
      title: `No news for ${STALE_DAYS}+ days (mark as ghosted?)`,
      items: stale.map((a) => ({ text: `${[a.company, a.role].filter(Boolean).join(" – ")}, applied ${a.applied_on}`, link: a.url })),
    });
  }

  const subject = `Job-Copilot: ${due.length} due today${stale.length ? `, ${stale.length} quiet` : ""}`;

  const text = [
    ...sections.flatMap((s) => [s.title, ...s.items.map((i) => `- ${i.text}${i.link ? ` (${i.link})` : ""}`), ""]),
    `Open Job-Copilot: ${appUrl}`,
  ].join("\n");

  const html = [
    ...sections.map(
      (s) =>
        `<h3>${escapeHtml(s.title)}</h3><ul>${s.items
          .map((i) => `<li>${escapeHtml(i.text)}${i.link ? ` — <a href="${escapeHtml(i.link)}">posting</a>` : ""}</li>`)
          .join("")}</ul>`,
    ),
    `<p><a href="${escapeHtml(appUrl)}">Open Job-Copilot</a></p>`,
  ].join("");

  return { subject, text, html };
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

module.exports = { buildDigest, STALE_DAYS };
