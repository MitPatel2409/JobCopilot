const args = require("../../../utils/args");
const { ValidationError } = require("../../../utils/errors");
const { requireApplication } = require("../../applicationService");
const { createReminder } = require("../../reminderService");
const { summarizeReminder } = require("./summaries");

function createAddReminderTool(ctx) {
  return {
    name: "add_reminder",
    description:
      "Set a reminder the user asked for, e.g. \"remind me to send the thank-you note Friday at 5pm\". " +
      "Link it to an application when it is about one.",
    parameters: {
      type: "object",
      properties: {
        message: { type: "string", description: "What to do, as an instruction." },
        due: { type: "string", description: "Local YYYY-MM-DD (defaults to the morning) or YYYY-MM-DDTHH:mm." },
        application_id: { type: "integer" },
      },
      required: ["message", "due"],
    },
    async execute(input) {
      const due = args.dateTime(ctx, input, "due", { required: true });
      if (due < ctx.clock()) throw new ValidationError("due is in the past.");

      const applicationId = args.id(input, "application_id");
      if (applicationId) requireApplication(ctx, applicationId);

      const reminder = await createReminder(ctx, {
        kind: "custom",
        applicationId: applicationId ?? null,
        message: args.text(input, "message", { required: true, max: 300 }),
        dueAt: due.toISOString(),
      });
      return { status: "saved", reminder: summarizeReminder(ctx, reminder) };
    },
  };
}

module.exports = { createAddReminderTool };
