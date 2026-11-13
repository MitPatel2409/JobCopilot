const args = require("../../../utils/args");
const { dueBefore } = require("../../dueRange");
const { summarizeReminder } = require("./summaries");

const RANGES = ["overdue", "today", "week", "all"];

function createListDueTool(ctx) {
  return {
    name: "list_due",
    description: "List pending reminders (follow-ups, revisions, custom), e.g. for \"what's due this week?\".",
    parameters: {
      type: "object",
      properties: { range: { type: "string", enum: RANGES, description: "Defaults to week." } },
    },
    async execute(input) {
      const range = args.oneOf(input, "range", RANGES) ?? "week";
      const reminders = ctx.store.reminders.listPending({ before: dueBefore(ctx, range) });
      return { range, count: reminders.length, reminders: reminders.map((reminder) => summarizeReminder(ctx, reminder)) };
    },
  };
}

module.exports = { createListDueTool };
