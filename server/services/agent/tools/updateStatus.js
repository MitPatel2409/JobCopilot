const args = require("../../../utils/args");
const { STATUSES, changeStatus } = require("../../applicationService");
const { summarizeApplication } = require("./summaries");

function createUpdateStatusTool(ctx) {
  return {
    name: "update_status",
    description:
      "Record news on an application: an online assessment (oa), interview, offer, rejection, or no reply (ghosted). " +
      "Any status other than applied cancels its pending follow-up reminder. " +
      "Moving to interview returns offer_prep_guide: ask the user if they want a prep guide.",
    parameters: {
      type: "object",
      properties: {
        application_id: { type: "integer" },
        status: { type: "string", enum: STATUSES },
        note: { type: "string", description: "Details, e.g. \"technical round on Nov 3 with the data team\"." },
      },
      required: ["application_id", "status"],
    },
    async execute(input) {
      const { application, event, cancelledFollowUps } = await changeStatus(
        ctx,
        args.id(input, "application_id", { required: true }),
        args.oneOf(input, "status", STATUSES, { required: true }),
        args.text(input, "note") ?? "",
      );
      const result = {
        status: event ? "updated" : "unchanged",
        application: summarizeApplication(application),
        cancelled_follow_ups: cancelledFollowUps,
      };
      if (event && application.status === "interview" && !ctx.store.prepGuides.get(application.id)) {
        result.offer_prep_guide = true;
        result.has_job_description = application.has_jd;
        result.has_resume = Boolean(ctx.store.documents.info(application.id) ?? ctx.store.documents.info(null));
      }
      return result;
    },
  };
}

module.exports = { createUpdateStatusTool };
