const args = require("../../../utils/args");
const { ValidationError } = require("../../../utils/errors");
const { editReminder, deleteReminder } = require("../../reminderService");
const { summarizeReminder } = require("./summaries");

function createEditReminderTool(ctx) {
  return {
    name: "edit_reminder",
    description: "Change what a reminder says and/or when it is due, e.g. \"make the RBC reminder Friday at 3pm\".",
    parameters: {
      type: "object",
      properties: {
        reminder_id: { type: "integer" },
        message: { type: "string", description: "The new text, as an instruction. Omit to keep it." },
        due: { type: "string", description: "Local YYYY-MM-DD or YYYY-MM-DDTHH:mm. Omit to keep it." },
      },
      required: ["reminder_id"],
    },
    async execute(input) {
      const due = args.dateTime(ctx, input, "due");
      if (due && due < ctx.clock()) throw new ValidationError("due is in the past.");
      const reminder = await editReminder(ctx, args.id(input, "reminder_id", { required: true }), {
        message: args.text(input, "message", { max: 300 }),
        dueAt: due,
      });
      return { status: "updated", reminder: summarizeReminder(ctx, reminder) };
    },
  };
}

function createDeleteReminderTool(ctx) {
  return {
    name: "delete_reminder",
    description: "Delete a reminder the user no longer wants (not one they finished: use complete_reminder for that).",
    parameters: {
      type: "object",
      properties: { reminder_id: { type: "integer" } },
      required: ["reminder_id"],
    },
    async execute(input) {
      const id = args.id(input, "reminder_id", { required: true });
      const reminder = ctx.store.reminders.get(id);
      await deleteReminder(ctx, id);
      return { status: "deleted", message: reminder.message };
    },
  };
}

module.exports = { createEditReminderTool, createDeleteReminderTool };
