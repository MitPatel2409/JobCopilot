const test = require("node:test");
const assert = require("node:assert/strict");
const { createTestContext } = require("./helpers/testContext");
const { createFakeLlm, toolTurn } = require("./helpers/fakeLlm");
const { runChat } = require("../services/agent/runChat");

const MESSAGE = "today i applied to rbc amplify and studied docker";

test("one message logs the application, the study session and the journal, then asks for the link", async () => {
  const llm = createFakeLlm({
    turns: [
      toolTurn(
        ["log_application", { company: "RBC", role: "Amplify" }],
        ["log_study", { topic: "Docker" }],
        ["log_journal", { summary: "Applied to RBC Amplify; studied Docker" }],
      ),
      {
        text: "Saved RBC Amplify (follow-up Nov 5) and Docker (first revision tomorrow). What's the job link? Did you reach out to a recruiter?",
        toolCalls: [],
      },
    ],
  });
  const ctx = createTestContext({ llm });
  const events = [];

  const result = await runChat({ ctx, message: MESSAGE, maxTurns: 10, onEvent: (e) => events.push(e) });

  assert.equal(result.stopReason, "model_stopped");
  assert.match(result.reply, /job link/);
  assert.equal(ctx.store.applications.list().length, 1);
  assert.equal(ctx.store.topics.list()[0].name, "Docker");
  assert.equal(ctx.store.journal.get("2026-10-29").summary, "Applied to RBC Amplify; studied Docker");
  assert.equal(ctx.store.reminders.listPending().length, 5); // 1 follow-up + 4 revisions

  assert.deepEqual(
    events.filter((e) => e.type === "tool_result").map((e) => [e.name, e.output.status]),
    [["log_application", "saved"], ["log_study", "saved"], ["log_journal", "saved"]],
  );

  // The tool results went back to the model, in the order it asked.
  assert.deepEqual(llm.sentToSession[1].toolResults.map((r) => r.id), ["call-0", "call-1", "call-2"]);

  const [userMessage, reply] = ctx.store.chat.recent(10);
  assert.equal(userMessage.content, MESSAGE);
  assert.equal(reply.role, "assistant");
  assert.equal(reply.actions.length, 3);
});

test("the next message carries the snapshot and the conversation so far", async () => {
  const llm = createFakeLlm({
    turns: [
      toolTurn(["log_application", { company: "RBC", role: "Amplify" }]),
      { text: "Saved. What's the link?", toolCalls: [] },
      toolTurn(["update_application", { application_id: 1, url: "https://jobs.rbc.com/amplify" }]),
      { text: "Link saved.", toolCalls: [] },
    ],
  });
  const ctx = createTestContext({ llm });

  await runChat({ ctx, message: "applied to rbc amplify", maxTurns: 10 });
  await runChat({ ctx, message: "https://jobs.rbc.com/amplify", maxTurns: 10 });

  const secondPrompt = llm.sentToSession[2].text;
  assert.match(secondPrompt, /Now: Thursday 2026-10-29, 14:00 \(America\/Toronto\)/);
  assert.match(secondPrompt, /#1 RBC – Amplify \| applied \| applied 2026-10-29 \| missing: url, contact, jd/);
  assert.match(secondPrompt, /User: applied to rbc amplify\n- You: Saved\. What's the link\?/);
  assert.match(secondPrompt, /New message from the user:\nhttps:\/\/jobs\.rbc\.com\/amplify$/);

  assert.equal(ctx.store.applications.get(1).url, "https://jobs.rbc.com/amplify");
});

test("a run that ends without text gets a short summary reply", async () => {
  const llm = createFakeLlm({ turns: [toolTurn(["log_study", { topic: "Kafka" }])] });
  const ctx = createTestContext({ llm });

  const result = await runChat({ ctx, message: "studied kafka", maxTurns: 10 });
  assert.equal(result.reply, "Done: log study.");
});

test("the turn limit stops a model that keeps calling tools", async () => {
  const loop = Array.from({ length: 5 }, () => toolTurn(["list_due", {}]));
  const ctx = createTestContext({ llm: createFakeLlm({ turns: loop }) });

  const result = await runChat({ ctx, message: "what's due", maxTurns: 2 });
  assert.equal(result.stopReason, "max_turns");
  assert.equal(result.turns, 2);
});

test("an LLM failure after some tools ran still records what was saved", async () => {
  const llm = createFakeLlm({ turns: [toolTurn(["log_study", { topic: "Kafka" }])] });
  const session = llm.startToolSession;
  llm.startToolSession = (...args) => {
    const inner = session(...args);
    let calls = 0;
    return {
      async send(input) {
        calls += 1;
        if (calls === 2) throw Object.assign(new Error("overloaded"), { status: 503 });
        return inner.send(input);
      },
    };
  };
  const ctx = createTestContext({ llm });

  await assert.rejects(runChat({ ctx, message: "studied kafka", maxTurns: 10 }), /overloaded/);
  const messages = ctx.store.chat.recent(10);
  assert.equal(messages.length, 2);
  assert.match(messages[1].content, /Done: log study\.\n\(Then I hit an error and stopped\.\)/);
  assert.equal(ctx.store.topics.list().length, 1);
});
