const args = require("../../../utils/args");
const { createPrepGuide } = require("../../prepGuideService");

function createCreatePrepGuideTool(ctx) {
  return {
    name: "create_prep_guide",
    description:
      "Make an interview prep guide for an application from its saved job description and the user's résumé: " +
      "topics to study and likely questions. Only when the user asks for or agrees to one. Needs the job description saved first.",
    parameters: {
      type: "object",
      properties: { application_id: { type: "integer" } },
      required: ["application_id"],
    },
    async execute(input) {
      const guide = await createPrepGuide(ctx, args.id(input, "application_id", { required: true }));
      return {
        status: "created",
        summary: guide.summary,
        used_resume: guide.used_resume,
        topics: guide.topics.map(({ name, priority, on_resume }) => ({ name, priority, on_resume })),
      };
    },
  };
}

module.exports = { createCreatePrepGuideTool };
