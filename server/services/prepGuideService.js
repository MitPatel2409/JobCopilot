/**
 * Interview prep: a guide made from the job description and the résumé
 * (what to study, why, and likely questions), and turning the topics the
 * user picks into study topics with reminders before the interview.
 */
const { ValidationError } = require("../utils/errors");
const { addDays, daysBetween, zonedToUtc } = require("../utils/time");
const { requireApplication, updateApplication, describe } = require("./applicationService");
const { resumeTextFor } = require("./documentService");
const { createReminder } = require("./reminderService");

const GUIDE_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string", description: "Two or three sentences: what this role cares about most." },
    topics: {
      type: "array",
      description: "5 to 10 things to study, most important first.",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "A short study-topic name, e.g. \"REST API design\" or \"SQL joins and indexes\"." },
          why: { type: "string", description: "One sentence: where the job description asks for it." },
          cover: { type: "array", items: { type: "string" }, description: "3 to 5 concrete things to review or practise." },
          priority: { type: "string", enum: ["high", "medium", "low"] },
          on_resume: { type: "boolean", description: "True if the résumé already shows this skill." },
        },
        required: ["name", "why", "cover", "priority", "on_resume"],
      },
    },
    questions: { type: "array", items: { type: "string" }, description: "5 to 8 questions this interview is likely to ask." },
    gaps: { type: "array", items: { type: "string" }, description: "Skills the job asks for that the résumé does not show." },
  },
  required: ["summary", "topics", "questions", "gaps"],
};

const GUIDE_SYSTEM = `You help a job seeker prepare for an interview. You get the job description and, when there is one, their résumé.
- Base every topic on something the job description asks for. Do not invent requirements, technologies or facts about the company.
- Prefer topics that are high priority in the job description and weak or missing on the résumé.
- Topic names are short and reusable as study-log entries ("Docker networking", "Behavioural: conflict stories").
- Include one behavioural topic when the description mentions teamwork, communication or leadership.
- If there is no résumé, set on_resume to false everywhere and leave gaps empty.`;

const MAX_JD = 15000;
const MAX_RESUME = 12000;

async function createPrepGuide(ctx, applicationId) {
  const application = requireApplication(ctx, applicationId);
  if (!application.jd_text) {
    throw new ValidationError("Save the job description first: the prep guide is built from it.");
  }
  const resume = resumeTextFor(ctx, applicationId);
  // A new guide keeps track of what an earlier one already put in the study plan.
  const alreadyAdded = new Set(
    (ctx.store.prepGuides.get(applicationId)?.topics ?? []).filter((topic) => topic.added).map((topic) => topic.name.toLowerCase()),
  );

  const guide = await ctx.llm.generateJson({
    name: "prep_guide",
    system: GUIDE_SYSTEM,
    prompt: [
      `Role: ${describe(application)}`,
      `Job description:\n${application.jd_text.slice(0, MAX_JD)}`,
      resume ? `Résumé:\n${resume.slice(0, MAX_RESUME)}` : "Résumé: (none uploaded)",
    ].join("\n\n"),
    schema: GUIDE_SCHEMA,
  });

  return ctx.store.prepGuides.save(applicationId, {
    summary: String(guide.summary ?? "").trim(),
    topics: (guide.topics ?? []).slice(0, 12).map((topic) => ({
      name: String(topic.name ?? "").trim().slice(0, 120),
      why: String(topic.why ?? "").trim(),
      cover: (topic.cover ?? []).map(String).slice(0, 8),
      priority: ["high", "medium", "low"].includes(topic.priority) ? topic.priority : "medium",
      on_resume: Boolean(topic.on_resume),
      added: alreadyAdded.has(String(topic.name ?? "").trim().toLowerCase()),
    })).filter((topic) => topic.name),
    questions: (guide.questions ?? []).map(String).slice(0, 10),
    gaps: (guide.gaps ?? []).map(String).slice(0, 10),
    used_resume: Boolean(resume),
  });
}

/**
 * Adds the chosen guide topics to the study plan: each becomes a study topic
 * (an existing one with the same name is reused) whose plan says what to
 * cover, and a reminder to study it, spread over the days before the
 * interview. Logging a study session later starts the usual revisions.
 */
async function addPrepTopics(ctx, applicationId, { names, interviewOn }) {
  const application = requireApplication(ctx, applicationId);
  const guide = ctx.store.prepGuides.get(applicationId);
  if (!guide) throw new ValidationError("Create the prep guide first.");

  const wanted = new Set(names.map((name) => name.toLowerCase()));
  const picked = guide.topics.filter((topic) => wanted.has(topic.name.toLowerCase()));
  if (picked.length === 0) throw new ValidationError("Pick at least one topic from the guide.");
  // Adding a topic twice would plan it twice and set two reminders.
  const chosen = picked.filter((topic) => !topic.added);
  if (chosen.length === 0) throw new ValidationError("Those topics are already in your study plan.");

  if (interviewOn && interviewOn !== application.interview_on) await updateApplication(ctx, applicationId, { interview_on: interviewOn });
  const days = studyDays(ctx.today(), interviewOn ?? application.interview_on, chosen.length);

  const added = [];
  for (const [index, item] of chosen.entries()) {
    const topic = ctx.store.topics.findByName(item.name) ?? ctx.store.topics.create(item.name);
    const plan = [`For the ${describe(application)} interview: ${item.why}`, ...item.cover.map((point) => `• ${point}`)].join("\n");
    ctx.store.topics.setPlan(topic.id, topic.plan ? `${topic.plan}\n\n${plan}` : plan);
    const reminder = await createReminder(ctx, {
      kind: "custom",
      applicationId,
      topicId: topic.id,
      message: `Study ${topic.name} for the ${application.company} interview`,
      dueAt: zonedToUtc(days[index], ctx.config.reminderHour, 0, ctx.config.timezone).toISOString(),
    });
    added.push({ topic: ctx.store.topics.get(topic.id), reminder });
  }

  ctx.store.prepGuides.save(applicationId, {
    ...guide,
    topics: guide.topics.map((topic) => (wanted.has(topic.name.toLowerCase()) ? { ...topic, added: true } : topic)),
  });
  return added;
}

/**
 * One study day per topic: spread from tomorrow to the day before the
 * interview, or one a day from tomorrow when the date is unknown or too close.
 */
function studyDays(today, interviewOn, count) {
  const first = addDays(today, 1);
  const room = interviewOn ? daysBetween(first, interviewOn) : 0; // days before the interview day
  if (room < 1) return Array.from({ length: count }, (_, index) => (interviewOn ? first : addDays(first, index)));
  return Array.from({ length: count }, (_, index) => addDays(first, Math.floor((index * room) / count)));
}

module.exports = { createPrepGuide, addPrepTopics, studyDays, GUIDE_SCHEMA };
