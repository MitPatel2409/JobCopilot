const args = require("../../../utils/args");
const { requireApplication, updateApplication } = require("../../applicationService");
const { summarizeApplication } = require("./summaries");

function createUpdateApplicationTool(ctx) {
  return {
    name: "update_application",
    description:
      "Fill in or correct an application's details: the job link, role, notes, the date applied, or the interview date. " +
      "Changing the applied date moves its follow-up; setting the interview date adds an interview reminder. " +
      "Set no_url / no_contact when the user says there is no link or no recruiter, so you stop asking.",
    parameters: {
      type: "object",
      properties: {
        application_id: { type: "integer" },
        company: { type: "string" },
        role: { type: "string" },
        url: { type: "string", description: "Link to the job posting." },
        applied_on: { type: "string", description: "YYYY-MM-DD." },
        interview_on: { type: "string", description: "YYYY-MM-DD the interview is on. Empty string to clear it." },
        notes: { type: "string", description: "Replaces the notes; include the old notes to keep them." },
        no_url: { type: "boolean", description: "True if the user has no link to give." },
        no_contact: { type: "boolean", description: "True if the user did not and will not contact a recruiter." },
      },
      required: ["application_id"],
    },
    async execute(input) {
      const id = args.id(input, "application_id", { required: true });
      requireApplication(ctx, id);

      const fields = {
        company: args.text(input, "company", { max: 200 }),
        role: args.text(input, "role", { max: 200 }),
        url: args.url(input, "url"),
        applied_on: args.date(input, "applied_on"),
        interview_on: input.interview_on === "" ? null : args.date(input, "interview_on"),
        notes: args.text(input, "notes"),
      };
      if (args.flag(input, "no_url")) fields.no_url = 1;
      if (args.flag(input, "no_contact")) fields.no_contact = 1;

      const application = await updateApplication(ctx, id, fields);
      return { status: "updated", application: { ...summarizeApplication(application), interview_on: application.interview_on } };
    },
  };
}

module.exports = { createUpdateApplicationTool };
