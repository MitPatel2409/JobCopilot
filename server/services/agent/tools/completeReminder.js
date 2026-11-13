const args = require("../../../utils/args");
const { completeReminder } = require("../../reminderService");
const { summarizeReminder } = require("./summaries");

function createCompleteReminderTool(ctx) {
  return {
    name: "complete_reminder",
    description: "Mark a reminder done, e.g. after the user says they followed up or revised a topic.",
    parameters: {
      type: "object",
      properties: { reminder_id: { type: "integer" } },
      required: ["reminder_id"],
    },
    async execute(input) {
      const reminder = await completeReminder(ctx, args.id(input, "reminder_id", { required: true }));
      return { status: "done", reminder: summarizeReminder(ctx, reminder) };
    },
  };
}

module.exports = { createCompleteReminderTool };
