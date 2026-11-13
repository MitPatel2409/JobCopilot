/**
 * Looks in the user's inbox for mail from recruiters they saved, at most
 * every CHECK_MINUTES. Each new message is stored as a match with the status
 * it seems to mean ("interview", "rejected", ...), for the user to confirm on
 * the Today view. Nothing changes on its own, and only the sender, subject
 * and Gmail's short snippet are kept.
 */
const { STATUSES } = require("../applicationService");

const CHECK_MINUTES = 15;
const FIRST_LOOKBACK_DAYS = 14;
const EMAILS_PER_SEARCH = 20;

const SUGGESTION_SCHEMA = {
  type: "object",
  properties: {
    status: {
      type: "string",
      enum: [...STATUSES, "none"],
      description: "What this message means for the application, or none if it changes nothing.",
    },
  },
  required: ["status"],
};

const SUGGESTION_SYSTEM = `You read the subject and opening of an email a recruiter sent to a job applicant and say what it means for the application:
oa (an online assessment or coding test), interview (an interview invite or scheduling), offer, rejected, or none (anything else: a reply, an update, a newsletter).
Choose none when unsure.`;

async function checkReplies(ctx, now) {
  const gmail = ctx.gmail;
  if (!gmail?.listMessageIds) return [];

  const last = ctx.store.meta.get("replies_checked_at");
  if (last && now - new Date(last) < CHECK_MINUTES * 60 * 1000) return [];
  ctx.store.meta.set("replies_checked_at", now.toISOString());

  const contacts = ctx.store.contacts.listWithEmail().filter((contact) => contact.application_id);
  if (contacts.length === 0) return [];
  const since = last ? new Date(last) : new Date(now.getTime() - FIRST_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const found = [];
  for (let start = 0; start < contacts.length; start += EMAILS_PER_SEARCH) {
    const batch = contacts.slice(start, start + EMAILS_PER_SEARCH);
    const emails = [...new Set(batch.map((contact) => contact.email.toLowerCase()))];
    const query = `from:(${emails.join(" OR ")}) after:${Math.floor(since.getTime() / 1000)}`;

    for (const id of await gmail.listMessageIds(query)) {
      if (ctx.store.mailMatches.has(id)) continue;
      const message = await gmail.getMessageSummary(id);
      const contact = batch.find((c) => message.from.toLowerCase().includes(c.email.toLowerCase()));
      if (!contact) continue;

      const application = ctx.store.applications.get(contact.application_id);
      const match = ctx.store.mailMatches.create({
        messageId: id,
        applicationId: contact.application_id,
        contactId: contact.id,
        sender: message.from,
        subject: message.subject,
        snippet: message.snippet,
        receivedAt: message.receivedAt,
        suggestedStatus: await suggestStatus(ctx, application, message),
      });
      if (match) found.push(match);
    }
  }

  if (found.length > 0) ctx.publish({ type: "mail_matches", count: found.length });
  return found;
}

/** One small model call; a failure only means no suggestion. */
async function suggestStatus(ctx, application, message) {
  try {
    const { status } = await ctx.llm.generateJson({
      name: "classify_reply",
      system: SUGGESTION_SYSTEM,
      prompt: [
        `Application: ${[application.company, application.role].filter(Boolean).join(" – ")} (now: ${application.status})`,
        `Subject: ${message.subject}`,
        `Opening: ${message.snippet}`,
      ].join("\n"),
      schema: SUGGESTION_SCHEMA,
    });
    return STATUSES.includes(status) && status !== application.status ? status : null;
  } catch {
    return null;
  }
}

module.exports = { checkReplies, CHECK_MINUTES };
