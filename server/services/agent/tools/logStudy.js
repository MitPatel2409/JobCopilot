const args = require("../../../utils/args");
const { logStudy } = require("../../studyService");
const { summarizeReminder } = require("./summaries");

function createLogStudyTool(ctx) {
  return {
    name: "log_study",
    description:
      "Record that the user studied a topic, with an optional note. Schedules spaced revision reminders " +
      "(1, 3, 7 and 21 days later) unless the topic already has revisions pending.",
    parameters: {
      type: "object",
      properties: {
        topic: { type: "string", description: "Short topic name, e.g. \"Docker\", \"System design: caching\"." },
        note: { type: "string", description: "What they learned or covered, in their words." },
        studied_on: { type: "string", description: "YYYY-MM-DD. Defaults to today." },
      },
      required: ["topic"],
    },
    async execute(input) {
      const { topic, revisions, scheduled } = await logStudy(ctx, {
        topic: args.text(input, "topic", { required: true, max: 120 }),
        note: args.text(input, "note") ?? "",
        studiedOn: args.date(input, "studied_on"),
      });
      return {
        status: "saved",
        topic: { id: topic.id, name: topic.name, note_count: topic.note_count },
        revisions_scheduled: scheduled,
        revisions: revisions.map((reminder) => summarizeReminder(ctx, reminder)),
      };
    },
  };
}

module.exports = { createLogStudyTool };
