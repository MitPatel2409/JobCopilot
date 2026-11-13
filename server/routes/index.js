const express = require("express");
const chat = require("../controllers/chatController");
const today = require("../controllers/todayController");
const applications = require("../controllers/applicationsController");
const contacts = require("../controllers/contactsController");
const reminders = require("../controllers/remindersController");
const topics = require("../controllers/topicsController");
const journal = require("../controllers/journalController");
const outreach = require("../controllers/outreachController");
const stats = require("../controllers/statsController");
const profile = require("../controllers/profileController");
const connectors = require("../controllers/connectorsController");
const mail = require("../controllers/mailController");
const events = require("../controllers/eventsController");
const { uploadOne } = require("../middleware/upload");

// Every route here runs for a signed-in user (middleware/auth.js sets req.ctx).
const router = express.Router();

router.get("/chat/history", chat.history);
router.post("/chat", chat.chat);

router.get("/today", today.today);
router.get("/stats", stats.stats);

router.get("/applications", applications.list);
router.post("/applications", applications.create);
router.get("/applications/:id", applications.get);
router.patch("/applications/:id", applications.update);
router.delete("/applications/:id", applications.remove);
router.put("/applications/:id/jd", applications.saveJd);
router.post("/applications/:id/jd/fetch", applications.fetchJd);
router.post("/applications/:id/resume", uploadOne, applications.uploadResume);
router.post("/applications/:id/resume/copy", applications.copyResume);
router.get("/applications/:id/resume", applications.downloadResume);
router.delete("/applications/:id/resume", applications.deleteResume);
router.post("/applications/:id/prep-guide", applications.createPrepGuide);
router.post("/applications/:id/prep-guide/topics", applications.addPrepTopics);
router.post("/applications/:id/contacts", contacts.create);
router.post("/applications/:id/outreach", outreach.create);

router.patch("/contacts/:id", contacts.update);
router.delete("/contacts/:id", contacts.remove);

router.patch("/outreach/:id", outreach.update);
router.delete("/outreach/:id", outreach.remove);
router.post("/outreach/:id/gmail-draft", outreach.gmailDraft);

router.get("/reminders", reminders.list);
router.post("/reminders", reminders.create);
router.patch("/reminders/:id", reminders.update);
router.delete("/reminders/:id", reminders.remove);
router.post("/reminders/:id/done", reminders.done);
router.post("/reminders/:id/snooze", reminders.snooze);

router.get("/topics", topics.list);
router.post("/topics", topics.create);
router.get("/topics/:id", topics.get);
router.patch("/topics/:id", topics.update);
router.delete("/topics/:id", topics.remove);
router.post("/topics/:id/notes", topics.addNote);
router.patch("/topics/:id/notes/:noteId", topics.updateNote);
router.delete("/topics/:id/notes/:noteId", topics.removeNote);

router.get("/journal", journal.list);
router.post("/journal", journal.append);
router.put("/journal/:date", journal.replace);

router.get("/profile", profile.get);
router.patch("/profile", profile.update);
router.post("/profile/resume", uploadOne, profile.uploadResume);
router.get("/profile/resume", profile.downloadResume);
router.delete("/profile/resume", profile.deleteResume);

router.get("/connectors", connectors.list);
router.delete("/connectors/:name", connectors.disconnect);

router.get("/mail-matches", mail.list);
router.post("/mail-matches/:id/apply", mail.apply);
router.post("/mail-matches/:id/dismiss", mail.dismiss);

router.get("/events", events.stream);

module.exports = router;
