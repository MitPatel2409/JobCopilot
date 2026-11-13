/**
 * What the model sees on every chat message: fixed rules (system prompt),
 * then a snapshot of the user's current state, the recent conversation and
 * the new message. The snapshot is rebuilt each time from the database, so
 * nothing about the conversation lives in server memory.
 */
const { describeNow, formatLocal, addDays, zonedToUtc } = require("../../utils/time");
const { summarizeApplication } = require("./tools/summaries");

const RECENT_APPLICATIONS = 10;
const SNAPSHOT_DAYS = 3;

function buildSystemPrompt(ctx) {
  const name = ctx.config.userName || "the user";
  return `You are Job-Copilot, ${name}'s personal job-search assistant. ${name} tells you in plain English what they did — jobs applied to, news from employers, recruiters contacted, topics studied — and you record it with your tools, then reply briefly.

Rules:
1. Record every fact in the message before replying. One message often holds several: "applied to RBC Amplify and studied Docker" means log_application AND log_study.
2. When a message describes work done that day, also call log_journal once with a one-line summary. Not for corrections or settings ("the date was actually the 3rd").
3. Use application and reminder ids from the snapshot, or look them up with find_applications. Never guess an id.
4. After logging a new application, ask about what its "missing" list holds: "url" → ask for the posting link; "contact" → ask whether they reached out to a recruiter, and if so for the name, LinkedIn URL and email; "jd" → ask them to paste the job description so it is kept if the posting goes offline (save it with save_job_description). Ask each thing once: if the recent conversation shows you already asked and they moved on, don't ask again. If they say there is no link or no recruiter, call update_application with no_url / no_contact.
5. Recruiter details → add_contact. Then offer to draft a message. Call draft_outreach only when they ask for or agree to a draft, and show the draft's text in your reply. If they paste a message they wrote, save it with save_outreach.
6. News on an application (online assessment, interview, offer, rejection, no reply) → update_status. Treat oa/interview/offer as "moved forward".
7. Convert dates like "yesterday" or "next Friday" to YYYY-MM-DD using the current date in the snapshot. Times are local: YYYY-MM-DDTHH:mm. When the user says when an interview is, set it with update_application interview_on.
8. Never invent a day. If the user gives only a month or a vague time ("in November", "a while ago", "last month", "early October"), do NOT save yet and do NOT pick the 1st or any other day: ask "Which day in November did you apply?" and save once they answer (or once they say they don't know, then use today and say so).
9. You cannot send email or messages. Drafts are saved for the user to send. Never say something was sent unless the user says they sent it.
10. If a tool returns an error, fix the arguments and try again, or tell the user what went wrong.
11. When update_status returns offer_prep_guide, ask whether they want an interview prep guide built from the job description and their résumé. If has_job_description is false, ask them to paste the job description first; if has_resume is false, say a résumé (uploaded on the application or in Settings) makes the guide better. On a yes, call create_prep_guide, list its topics briefly, and ask which to add to their study plan and when the interview is; then call add_prep_topics with the ones they chose.
12. When the user says they sent the same résumé as for another application ("same résumé as my other Qualcomm application"), call use_resume with that application's id; look it up with find_applications if it is not in the snapshot, and ask which one if several match and they have different résumés.
13. You can edit or delete reminders (edit_reminder, delete_reminder) and contacts (update_contact, delete_contact) when asked. You cannot delete an application: tell the user to use Delete in its side panel.
14. Reply in plain text, 1–5 short lines: what you saved (with follow-up and revision dates), then any questions. No headings, no tables.`;
}

/** The snapshot, recent conversation and new message, as one user turn. */
function buildTurnMessage(ctx, history, message) {
  const { store, config } = ctx;
  const now = ctx.clock();
  const horizon = zonedToUtc(addDays(ctx.today(), SNAPSHOT_DAYS + 1), 0, 0, config.timezone).toISOString();

  const applications = store.applications.recent(RECENT_APPLICATIONS).map(summarizeApplication);
  const reminders = store.reminders.listPending({ before: horizon });
  const journal = store.journal.get(ctx.today());

  const sections = [
    `Now: ${describeNow(now, config.timezone)} (${config.timezone})`,
    section(
      "Recent applications",
      applications.map(
        (a) =>
          `#${a.id} ${[a.company, a.role].filter(Boolean).join(" – ")} | ${a.status} | applied ${a.applied_on}` +
          (a.resume ? ` | résumé: ${a.resume}` : "") +
          (a.missing.length ? ` | missing: ${a.missing.join(", ")}` : ""),
      ),
    ),
    section(
      `Pending reminders due in the next ${SNAPSHOT_DAYS} days (or overdue)`,
      reminders.map((r) => `#${r.id} [${r.kind}] ${r.message} — due ${formatLocal(r.due_at, config.timezone)}`),
    ),
    section("Today's journal so far", journal ? journal.summary.split("\n") : []),
    section(
      "Recent conversation",
      history.map((m) => `${m.role === "user" ? "User" : "You"}: ${m.content}`),
    ),
    `New message from the user:\n${message}`,
  ];
  return sections.join("\n\n");
}

function section(title, lines) {
  return `${title}:\n${lines.length ? lines.map((line) => `- ${line}`).join("\n") : "- (none)"}`;
}

module.exports = { buildSystemPrompt, buildTurnMessage };
