const args = require("../../../utils/args");
const { STATUSES } = require("../../applicationService");
const { summarizeApplication } = require("./summaries");

const LIMIT = 20;

function createFindApplicationsTool(ctx) {
  return {
    name: "find_applications",
    description:
      "Look up applications by company or role (partial words work: \"amplify\" finds \"RBC – Amplify Intern\"), " +
      "or list them by status. Use it to get an application_id that is not in the snapshot.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Words from the company or role. Empty lists everything." },
        status: { type: "string", enum: STATUSES },
      },
    },
    async execute(input) {
      const query = args.text(input, "query", { max: 200 });
      const status = args.oneOf(input, "status", STATUSES);

      let found = query ? ctx.store.applications.search(query) : ctx.store.applications.list({ status });
      if (status) found = found.filter((application) => application.status === status);

      return {
        count: found.length,
        applications: found.slice(0, LIMIT).map((application) => ({
          ...summarizeApplication(application),
          contacts: ctx.store.contacts.listByApplication(application.id).map(({ id, name, email, linkedin_url }) => ({
            id,
            name,
            email,
            linkedin_url,
          })),
        })),
      };
    },
  };
}

module.exports = { createFindApplicationsTool };
