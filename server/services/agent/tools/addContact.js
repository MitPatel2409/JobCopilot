const args = require("../../../utils/args");
const { requireApplication } = require("../../applicationService");

function createAddContactTool(ctx) {
  return {
    name: "add_contact",
    description: "Save a recruiter or referral contact (name, LinkedIn, email) for an application.",
    parameters: {
      type: "object",
      properties: {
        application_id: { type: "integer" },
        name: { type: "string" },
        title: { type: "string", description: "e.g. \"Campus Recruiter\"." },
        linkedin_url: { type: "string" },
        email: { type: "string" },
      },
      required: ["application_id", "name"],
    },
    async execute(input) {
      const applicationId = args.id(input, "application_id", { required: true });
      requireApplication(ctx, applicationId);

      const contact = ctx.store.contacts.create({
        applicationId,
        name: args.text(input, "name", { required: true, max: 200 }),
        title: args.text(input, "title", { max: 200 }) ?? "",
        linkedinUrl: args.url(input, "linkedin_url") ?? null,
        email: args.email(input, "email") ?? null,
      });
      return { status: "saved", contact };
    },
  };
}

module.exports = { createAddContactTool };
