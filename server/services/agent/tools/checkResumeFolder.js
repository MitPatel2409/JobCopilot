const { MANUAL_SETTLE_MS, scan, inbox } = require("../../resumeFolderService");

function createCheckResumeFolderTool(ctx) {
  return {
    name: "check_resume_folder",
    description:
      "Look in the user's résumé folder for new tailored résumés (\"check my résumé folder\"). Files that clearly belong to one application " +
      "are attached only if the user turned that on in Settings; the rest wait on the Today page for the user to pick. " +
      "Never attach files yourself with this tool, and never change the folder.",
    parameters: { type: "object", properties: {} },
    async execute() {
      const result = await scan(ctx, { settleMs: MANUAL_SETTLE_MS });
      if (!result.configured) return { status: "no_folder", message: "No résumé folder is set. It can be chosen in Settings." };
      if (result.error) return { status: "error", message: result.error };
      return {
        status: "checked",
        files_in_folder: result.found,
        new_files: result.added,
        attached: result.attached.map(({ filename, label }) => ({ file: filename, application: label })),
        waiting_on_today_page: inbox(ctx).map((file) => ({
          file: file.filename,
          best_guess: file.guesses[0] ? `${file.guesses[0].company} ${file.guesses[0].role}`.trim() : null,
        })),
      };
    },
  };
}

module.exports = { createCheckResumeFolderTool };
