const args = require("../../../utils/args");
const { copyResume } = require("../../documentService");

function createUseResumeTool(ctx) {
  return {
    name: "use_resume",
    description:
      "Attach to an application the same résumé already saved on another application (\"I used the same résumé as for X\"), " +
      "or the base résumé from Settings when from_application_id is omitted and the user says so.",
    parameters: {
      type: "object",
      properties: {
        application_id: { type: "integer", description: "The application that gets the résumé." },
        from_application_id: { type: "integer", description: "The application whose résumé was reused. Omit for the base résumé." },
      },
      required: ["application_id"],
    },
    async execute(input) {
      const to = args.id(input, "application_id", { required: true });
      const resume = copyResume(ctx, to, args.id(input, "from_application_id") ?? null);
      return { status: "attached", application_id: to, resume: resume.filename };
    },
  };
}

module.exports = { createUseResumeTool };
