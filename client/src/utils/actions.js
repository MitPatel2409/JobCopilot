/**
 * Turns the agent's tool calls into short chips for the chat, e.g.
 * "Saved RBC – Amplify" and "Follow-up Thu, Nov 5". Each tool result
 * gives zero or more chips: { kind, text, tone }.
 */
import { statusInfo } from "./status";

const app = (output) => [output?.application?.company, output?.application?.role].filter(Boolean).join(" – ");

const DESCRIBERS = {
  log_application(output) {
    if (output.status === "already_logged") return [{ kind: "job", text: `Already tracking ${app(output)}` }];
    const chips = [{ kind: "job", text: `Saved ${app(output)}` }];
    if (output.follow_up) chips.push({ kind: "reminder", text: `Follow-up ${output.follow_up.due}` });
    return chips;
  },
  update_application: (output) => [{ kind: "job", text: `Updated ${app(output)}` }],
  update_status: (output) =>
    output.status === "unchanged"
      ? []
      : [{ kind: "status", text: `${app(output)} → ${statusInfo(output.application.status).label}`, tone: "good" }],
  find_applications: () => [],
  add_contact: (output) => [{ kind: "contact", text: `Saved contact ${output.contact.name}` }],
  draft_outreach: () => [{ kind: "mail", text: "Drafted a message (not sent)" }],
  save_outreach: (output) => [{ kind: "mail", text: output.status === "marked_sent" ? "Marked message as sent" : "Saved your message" }],
  log_study(output) {
    const chips = [{ kind: "study", text: `Logged ${output.topic.name}` }];
    if (output.revisions_scheduled && output.revisions[0]) {
      chips.push({ kind: "reminder", text: `Revise ${output.revisions[0].due}` });
    }
    return chips;
  },
  add_reminder: (output) => [{ kind: "reminder", text: `Reminder ${output.reminder.due}` }],
  complete_reminder: (output) => [{ kind: "done", text: `Done: ${output.reminder.message}`, tone: "good" }],
  snooze_reminder: (output) => [{ kind: "reminder", text: `Snoozed to ${output.reminder.due}` }],
  log_journal: () => [{ kind: "journal", text: "Journal updated" }],
  list_due: () => [],
  save_job_description: (output) => [{ kind: "job", text: `Saved the job description for ${app(output)}` }],
  create_prep_guide: (output) => [{ kind: "study", text: `Made a prep guide (${output.topics.length} topics)` }],
  edit_reminder: (output) => [{ kind: "reminder", text: `Reminder changed: ${output.reminder.message}, ${output.reminder.due}` }],
  delete_reminder: (output) => [{ kind: "reminder", text: `Deleted reminder: ${output.message}` }],
  update_contact: (output) => [{ kind: "contact", text: `Updated contact ${output.contact.name}` }],
  delete_contact: (output) => [{ kind: "contact", text: `Deleted contact ${output.name}` }],
  use_resume: (output) => [{ kind: "job", text: `Attached ${output.resume}` }],
  add_prep_topics: (output) => output.topics.map((topic) => ({ kind: "study", text: `Study ${topic.name} ${topic.study.due}` })),
};

export function describeAction({ name, output }) {
  if (!output || output.status === "error") {
    return [{ kind: "error", text: `${name.replace(/_/g, " ")} failed: ${output?.message ?? "unknown error"}`, tone: "bad" }];
  }
  const describe = DESCRIBERS[name];
  return describe ? describe(output) : [{ kind: "done", text: name.replace(/_/g, " ") }];
}
