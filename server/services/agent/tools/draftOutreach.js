/**
 * Writes an outreach message with a separate LLM call and saves it as a draft.
 * Nothing is ever sent: the user copies it or opens it in their mail app.
 */
const args = require("../../../utils/args");
const { ValidationError } = require("../../../utils/errors");
const { requireApplication } = require("../../applicationService");

const DRAFT_SCHEMA = {
  type: "object",
  properties: {
    subject: { type: "string", description: "Email subject line. Empty for a LinkedIn message." },
    body: { type: "string" },
  },
  required: ["subject", "body"],
};

const DRAFT_SYSTEM = `You write short outreach messages from a job seeker to a recruiter.
- Email: under 150 words. LinkedIn connection note: under 300 characters, no subject.
- Specific and polite: name the role, say why the sender is a fit using ONLY the facts given, and make one clear ask.
- Never invent experience, numbers, mutual contacts or details about the company.
- No placeholders like [Your Name]. Sign with the sender's name if given, otherwise leave the sign-off unsigned.`;

function createDraftOutreachTool(ctx) {
  return {
    name: "draft_outreach",
    description:
      "Draft an email or LinkedIn message to a contact about an application and save it as a draft. " +
      "Only when the user asks for or agrees to a draft. It is not sent.",
    parameters: {
      type: "object",
      properties: {
        application_id: { type: "integer" },
        contact_id: { type: "integer", description: "The recruiter, from add_contact or find_applications." },
        channel: { type: "string", enum: ["email", "linkedin"] },
        intent: {
          type: "string",
          description: "What the message is for, e.g. \"just applied, ask for a quick chat\" or \"follow up after a week\".",
        },
      },
      required: ["application_id", "intent"],
    },
    async execute(input) {
      const application = requireApplication(ctx, args.id(input, "application_id", { required: true }));
      const contactId = args.id(input, "contact_id");
      const contact = contactId ? ctx.store.contacts.get(contactId) : null;
      if (contactId && !contact) throw new ValidationError(`Contact #${contactId} does not exist.`);
      const channel = args.oneOf(input, "channel", ["email", "linkedin"]) ?? (contact?.email || !contact ? "email" : "linkedin");

      const draft = await ctx.llm.generateJson({
        name: "draft_outreach",
        system: DRAFT_SYSTEM,
        prompt: buildPrompt(ctx, { application, contact, channel, intent: args.text(input, "intent", { required: true }) }),
        schema: DRAFT_SCHEMA,
      });

      const outreach = ctx.store.outreach.create({
        applicationId: application.id,
        contactId: contact?.id ?? null,
        channel,
        subject: channel === "email" ? String(draft.subject ?? "").trim() : "",
        body: String(draft.body ?? "").trim(),
      });
      return {
        status: "drafted_not_sent",
        outreach: { id: outreach.id, channel, to: contact?.email ?? contact?.linkedin_url ?? null, subject: outreach.subject, body: outreach.body },
      };
    },
  };
}

function buildPrompt(ctx, { application, contact, channel, intent }) {
  const { userName, userPitch } = ctx.config;
  return [
    `Channel: ${channel === "email" ? "email" : "LinkedIn message"}`,
    `Purpose: ${intent}`,
    `Role: ${application.role || "(not given)"} at ${application.company}, applied on ${application.applied_on}`,
    application.url ? `Posting: ${application.url}` : null,
    contact ? `Recipient: ${contact.name}${contact.title ? `, ${contact.title}` : ""}` : "Recipient: the recruiter (name unknown)",
    `Sender: ${userName || "(name not given)"}`,
    userPitch ? `About the sender: ${userPitch}` : "About the sender: no details given; keep the pitch general.",
  ]
    .filter(Boolean)
    .join("\n");
}

module.exports = { createDraftOutreachTool };
