const args = require("../../../utils/args");
const { saveJobDescription } = require("../../jobDescriptionService");
const { summarizeApplication } = require("./summaries");

function createSaveJobDescriptionTool(ctx) {
  return {
    name: "save_job_description",
    description:
      "Save the job description the user pasted for an application, word for word, so it is kept if the posting goes offline. " +
      "It is also what the interview prep guide is built from.",
    parameters: {
      type: "object",
      properties: {
        application_id: { type: "integer" },
        text: { type: "string", description: "The job description exactly as the user pasted it." },
      },
      required: ["application_id", "text"],
    },
    async execute(input) {
      const application = saveJobDescription(
        ctx,
        args.id(input, "application_id", { required: true }),
        args.text(input, "text", { required: true, max: 30000 }),
      );
      return { status: "saved", application: summarizeApplication(application), characters: application.jd_text.length };
    },
  };
}

module.exports = { createSaveJobDescriptionTool };
