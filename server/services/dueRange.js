/**
 * Turns "overdue" / "today" / "week" / "all" into the cut-off instant for
 * pending reminders. Shared by the agent's list_due tool and GET /reminders.
 */
const { addDays, zonedToUtc } = require("../utils/time");
const { ValidationError } = require("../utils/errors");

function dueBefore(ctx, range) {
  const startOfDay = (date) => zonedToUtc(date, 0, 0, ctx.config.timezone).toISOString();

  switch (range) {
    case "overdue":
      return ctx.clock().toISOString();
    case "today":
      return startOfDay(addDays(ctx.today(), 1));
    case "week":
      return startOfDay(addDays(ctx.today(), 8)); // through the end of the 7th day
    case "all":
    case undefined:
      return undefined;
    default:
      throw new ValidationError("range must be overdue, today, week or all.");
  }
}

module.exports = { dueBefore };
