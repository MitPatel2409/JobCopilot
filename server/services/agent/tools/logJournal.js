const args = require("../../../utils/args");

function createLogJournalTool(ctx) {
  return {
    name: "log_journal",
    description:
      "Add one line to the day's journal summarizing what the user did, e.g. \"Applied to RBC Amplify; studied Docker networking\".",
    parameters: {
      type: "object",
      properties: {
        summary: { type: "string", description: "One short line." },
        date: { type: "string", description: "YYYY-MM-DD. Defaults to today." },
      },
      required: ["summary"],
    },
    async execute(input) {
      const date = args.date(input, "date") ?? ctx.today();
      const entry = ctx.store.journal.append(date, args.text(input, "summary", { required: true, max: 500 }));
      return { status: "saved", date, journal: entry.summary };
    },
  };
}

module.exports = { createLogJournalTool };
