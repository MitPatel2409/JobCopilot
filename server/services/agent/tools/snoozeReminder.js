const args = require("../../../utils/args");
const { ValidationError } = require("../../../utils/errors");
const { snoozeReminder } = require("../../reminderService");
const { summarizeReminder } = require("./summaries");

function createSnoozeReminderTool(ctx) {
  return {
    name: "snooze_reminder",
    description: "Move a reminder to a later time.",
    parameters: {
      type: "object",
      properties: {
        reminder_id: { type: "integer" },
        until: { type: "string", description: "Local YYYY-MM-DD or YYYY-MM-DDTHH:mm." },
      },
      required: ["reminder_id", "until"],
    },
    async execute(input) {
      const until = args.dateTime(ctx, input, "until", { required: true });
      if (until < ctx.clock()) throw new ValidationError("until is in the past.");

      const reminder = await snoozeReminder(ctx, args.id(input, "reminder_id", { required: true }), until);
      return { status: "snoozed", reminder: summarizeReminder(ctx, reminder) };
    },
  };
}

module.exports = { createSnoozeReminderTool };
