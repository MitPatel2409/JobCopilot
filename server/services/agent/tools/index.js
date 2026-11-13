/**
 * The agent's toolbox: the definitions sent to the model, plus one
 * `execute` function that runs whichever tool the model asked for.
 */
const { createLogApplicationTool } = require("./logApplication");
const { createUpdateApplicationTool } = require("./updateApplication");
const { createUpdateStatusTool } = require("./updateStatus");
const { createFindApplicationsTool } = require("./findApplications");
const { createAddContactTool } = require("./addContact");
const { createDraftOutreachTool } = require("./draftOutreach");
const { createSaveOutreachTool } = require("./saveOutreach");
const { createLogStudyTool } = require("./logStudy");
const { createAddReminderTool } = require("./addReminder");
const { createCompleteReminderTool } = require("./completeReminder");
const { createSnoozeReminderTool } = require("./snoozeReminder");
const { createLogJournalTool } = require("./logJournal");
const { createListDueTool } = require("./listDue");
const { createSaveJobDescriptionTool } = require("./saveJobDescription");
const { createCreatePrepGuideTool } = require("./createPrepGuide");
const { createAddPrepTopicsTool } = require("./addPrepTopics");
const { createUseResumeTool } = require("./useResume");
const { createEditReminderTool, createDeleteReminderTool } = require("./editReminder");
const { createUpdateContactTool, createDeleteContactTool } = require("./editContact");

function createToolbox(ctx) {
  const tools = [
    createLogApplicationTool(ctx),
    createUpdateApplicationTool(ctx),
    createUpdateStatusTool(ctx),
    createFindApplicationsTool(ctx),
    createAddContactTool(ctx),
    createDraftOutreachTool(ctx),
    createSaveOutreachTool(ctx),
    createLogStudyTool(ctx),
    createAddReminderTool(ctx),
    createCompleteReminderTool(ctx),
    createSnoozeReminderTool(ctx),
    createLogJournalTool(ctx),
    createListDueTool(ctx),
    createSaveJobDescriptionTool(ctx),
    createCreatePrepGuideTool(ctx),
    createAddPrepTopicsTool(ctx),
    createUseResumeTool(ctx),
    createEditReminderTool(ctx),
    createDeleteReminderTool(ctx),
    createUpdateContactTool(ctx),
    createDeleteContactTool(ctx),
  ];
  const toolsByName = new Map(tools.map((tool) => [tool.name, tool]));

  /** Runs a tool call. Errors become a result the model can read, so one bad call does not end the run. */
  async function execute(call) {
    const tool = toolsByName.get(call.name);
    if (!tool) {
      return { status: "error", message: `Unknown tool "${call.name}".` };
    }
    try {
      return await tool.execute(call.args ?? {});
    } catch (error) {
      return { status: "error", message: error.message };
    }
  }

  const definitions = tools.map(({ name, description, parameters }) => ({ name, description, parameters }));

  return { definitions, execute };
}

module.exports = { createToolbox };
