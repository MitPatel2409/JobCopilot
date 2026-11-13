const args = require("../../../utils/args");
const { logApplication } = require("../../applicationService");
const { saveJobDescription } = require("../../jobDescriptionService");
const { copyResume } = require("../../documentService");
const { summarizeApplication, summarizeReminder } = require("./summaries");

function createLogApplicationTool(ctx) {
  return {
    name: "log_application",
    description:
      "Record a job the user applied to. Schedules a follow-up reminder automatically. " +
      "Two postings with the same title but different links are two applications. " +
      "The result lists what is still `missing` (url, contact, jd) so you can ask for it.",
    parameters: {
      type: "object",
      properties: {
        company: { type: "string", description: "Company name, e.g. \"RBC\"." },
        role: { type: "string", description: "Job title or program, e.g. \"Amplify Intern\". Empty if not given." },
        url: { type: "string", description: "Link to the job posting, if the user gave one." },
        applied_on: {
          type: "string",
          description: "YYYY-MM-DD of a day the user named (\"today\", \"Nov 8\", \"last Tuesday\"). Omit for today. If they gave only a month, ask first.",
        },
        notes: { type: "string", description: "Anything else worth keeping about this application." },
        job_description: { type: "string", description: "The job description, if the user pasted it, word for word." },
        resume_from_application_id: {
          type: "integer",
          description: "If the user sent the same résumé as for another application, that application's id.",
        },
      },
      required: ["company"],
    },
    async execute(input) {
      const logged = await logApplication(ctx, {
        company: args.text(input, "company", { required: true, max: 200 }),
        role: args.text(input, "role", { max: 200 }) ?? "",
        url: args.url(input, "url") ?? null,
        appliedOn: args.date(input, "applied_on"),
        notes: args.text(input, "notes") ?? "",
      });
      const { created, followUp } = logged;
      let { application } = logged;
      const jd = args.text(input, "job_description", { max: 30000 });
      if (jd && !application.jd_text) application = saveJobDescription(ctx, application.id, jd);
      const resumeFrom = args.id(input, "resume_from_application_id");
      const resume = resumeFrom ? copyResume(ctx, application.id, resumeFrom) : null;

      return {
        status: created ? "saved" : "already_logged",
        resume: resume?.filename ?? application.resume_filename ?? null,
        application: summarizeApplication(application),
        follow_up: followUp ? summarizeReminder(ctx, followUp) : null,
      };
    },
  };
}

module.exports = { createLogApplicationTool };
