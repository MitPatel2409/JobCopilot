/**
 * Every repository over one database, for one user. Each repository adds the
 * user to every statement, so code holding a store can only see that user's
 * data. This is the only layer that writes SQL, so a move to Postgres later
 * only touches services/db/.
 */
const { createApplicationsRepo } = require("./repos/applications");
const { createStatusEventsRepo } = require("./repos/statusEvents");
const { createContactsRepo } = require("./repos/contacts");
const { createOutreachRepo } = require("./repos/outreach");
const { createTopicsRepo } = require("./repos/topics");
const { createRemindersRepo } = require("./repos/reminders");
const { createJournalRepo } = require("./repos/journal");
const { createChatRepo } = require("./repos/chat");
const { createMetaRepo } = require("./repos/meta");
const { createStatsRepo } = require("./repos/stats");
const { createDocumentsRepo } = require("./repos/documents");
const { createPrepGuidesRepo } = require("./repos/prepGuides");
const { createMailMatchesRepo } = require("./repos/mailMatches");

function createStore(db, userId) {
  if (!userId) throw new Error("createStore needs a user id.");
  return {
    db,
    applications: createApplicationsRepo(db, userId),
    statusEvents: createStatusEventsRepo(db, userId),
    contacts: createContactsRepo(db, userId),
    outreach: createOutreachRepo(db, userId),
    topics: createTopicsRepo(db, userId),
    reminders: createRemindersRepo(db, userId),
    journal: createJournalRepo(db, userId),
    chat: createChatRepo(db, userId),
    meta: createMetaRepo(db, userId),
    stats: createStatsRepo(db, userId),
    documents: createDocumentsRepo(db, userId),
    prepGuides: createPrepGuidesRepo(db, userId),
    mailMatches: createMailMatchesRepo(db, userId),
  };
}

module.exports = { createStore };
