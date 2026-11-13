const args = require("../../../utils/args");
const { ValidationError } = require("../../../utils/errors");
const { requireApplication } = require("../../applicationService");

function createSaveOutreachTool(ctx) {
  return {
    name: "save_outreach",
    description:
      "Save a message the user wrote themselves, word for word, or mark an existing draft as sent when the user says they sent it.",
    parameters: {
      type: "object",
      properties: {
        outreach_id: { type: "integer", description: "An existing draft to mark as sent. Omit to save a new message." },
        application_id: { type: "integer" },
        contact_id: { type: "integer" },
        channel: { type: "string", enum: ["email", "linkedin"] },
        subject: { type: "string" },
        body: { type: "string", description: "The message exactly as the user gave it." },
        sent: { type: "boolean", description: "True if the user says it was sent." },
        sent_on: { type: "string", description: "YYYY-MM-DD. Defaults to today when sent is true." },
      },
    },
    async execute(input) {
      const sent = args.flag(input, "sent");
      const sentOn = sent ? args.date(input, "sent_on") ?? ctx.today() : null;
      const outreachId = args.id(input, "outreach_id");

      if (outreachId) {
        if (!ctx.store.outreach.get(outreachId)) throw new ValidationError(`Outreach #${outreachId} does not exist.`);
        const updated = ctx.store.outreach.update(outreachId, {
          subject: args.text(input, "subject", { max: 300 }),
          body: args.text(input, "body", { max: 10000 }),
          ...(sent ? { status: "sent", sent_on: sentOn } : {}),
        });
        return { status: sent ? "marked_sent" : "updated", outreach: { id: updated.id, status: updated.status } };
      }

      const applicationId = args.id(input, "application_id", { required: true });
      requireApplication(ctx, applicationId);
      const contactId = args.id(input, "contact_id");
      if (contactId && !ctx.store.contacts.get(contactId)) throw new ValidationError(`Contact #${contactId} does not exist.`);

      const outreach = ctx.store.outreach.create({
        applicationId,
        contactId: contactId ?? null,
        channel: args.oneOf(input, "channel", ["email", "linkedin"]) ?? "email",
        subject: args.text(input, "subject", { max: 300 }) ?? "",
        body: args.text(input, "body", { required: true, max: 10000 }),
        status: sent ? "sent" : "draft",
        sentOn,
      });
      return { status: "saved", outreach: { id: outreach.id, status: outreach.status } };
    },
  };
}

module.exports = { createSaveOutreachTool };
