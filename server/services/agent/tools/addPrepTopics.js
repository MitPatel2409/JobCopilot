const args = require("../../../utils/args");
const { ValidationError } = require("../../../utils/errors");
const { addPrepTopics } = require("../../prepGuideService");
const { summarizeReminder } = require("./summaries");

function createAddPrepTopicsTool(ctx) {
  return {
    name: "add_prep_topics",
    description:
      "Add topics from an application's prep guide to the study plan, with a reminder to study each before the interview. " +
      "Use the topic names exactly as create_prep_guide returned them, and only the ones the user chose.",
    parameters: {
      type: "object",
      properties: {
        application_id: { type: "integer" },
        topics: { type: "array", items: { type: "string" } },
        interview_on: { type: "string", description: "YYYY-MM-DD, if the user said when the interview is." },
      },
      required: ["application_id", "topics"],
    },
    async execute(input) {
      if (!Array.isArray(input.topics)) throw new ValidationError("topics must be a list of topic names.");
      const added = await addPrepTopics(ctx, args.id(input, "application_id", { required: true }), {
        names: input.topics.map(String),
        interviewOn: args.date(input, "interview_on"),
      });
      return {
        status: "added",
        topics: added.map(({ topic, reminder }) => ({ name: topic.name, study: summarizeReminder(ctx, reminder) })),
      };
    },
  };
}

module.exports = { createAddPrepTopicsTool };
