import { useState } from "react";
import { Check, RefreshCw, Sparkles } from "lucide-react";
import { sendJson } from "../../api/client";
import { useAction } from "../../hooks/useAction";
import { formatDateTime } from "../../utils/format";
import { Button, Card, Empty, Field, Input, SectionTitle } from "../ui";

const PRIORITY = { high: "text-danger", medium: "text-warn", low: "text-muted" };

/**
 * The interview prep guide: what to study (tick topics to add them to the
 * study plan, with a reminder each before the interview), likely questions,
 * and what the résumé does not show yet.
 */
export default function PrepGuideSection({ application, guide, resume, onChanged, onError, onAdded }) {
  const { busy, run } = useAction(onError);

  async function generate() {
    if (await run(() => sendJson(`/applications/${application.id}/prep-guide`, "POST"))) onChanged();
  }

  return (
    <section id="prep-guide">
      <SectionTitle>Interview prep guide</SectionTitle>
      {!guide ? (
        <div className="space-y-2">
          <Empty>
            {application.jd_text
              ? "Get a list of topics to study for this interview, built from the job description and your résumé."
              : "Save the job description above first: the guide is built from it."}
          </Empty>
          <Button variant="primary" disabled={busy || !application.jd_text} onClick={generate}>
            <Sparkles className="size-3.5" aria-hidden /> {busy ? "Making the guide…" : "Make prep guide"}
          </Button>
        </div>
      ) : (
        <>
          <StaleNotice application={application} guide={guide} resume={resume} />
          <GuideBody key={guide.created_at} application={application} guide={guide} busy={busy} onRegenerate={generate} onChanged={onChanged} onError={onError} onAdded={onAdded} />
        </>
      )}
    </section>
  );
}

/** Says when the job description or résumé changed after the guide was made. */
function StaleNotice({ application, guide, resume }) {
  const changed = [
    application.jd_saved_at && application.jd_saved_at > guide.created_at && "job description",
    resume && resume.created_at > guide.created_at && "résumé",
  ].filter(Boolean);
  if (changed.length === 0) return null;
  return (
    <p className="mb-3 rounded-md border border-line-strong bg-sunken px-3 py-2 text-sm text-ink-soft">
      The {changed.join(" and ")} changed since this guide was made. Make a new guide to use it; topics already in your study plan stay there.
    </p>
  );
}

function GuideBody({ application, guide, busy, onRegenerate, onChanged, onError, onAdded }) {
  const [picked, setPicked] = useState(() => new Set(guide.topics.filter((t) => !t.added && t.priority === "high").map((t) => t.name)));
  const [interviewOn, setInterviewOn] = useState(application.interview_on ?? "");
  const adding = useAction(onError);

  function toggle(name) {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  async function add() {
    const result = await adding.run(() =>
      sendJson(`/applications/${application.id}/prep-guide/topics`, "POST", { topics: [...picked], interview_on: interviewOn || undefined }),
    );
    if (result) {
      setPicked(new Set());
      onAdded(result.added.length);
      onChanged();
    }
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-1 p-3.5 text-sm">
        <p className="text-ink-soft">{guide.summary}</p>
        <p className="text-xs text-muted">
          Made {formatDateTime(guide.created_at)} from the job description{guide.used_resume ? " and your résumé" : " (no résumé uploaded)"}.
        </p>
      </Card>

      <div>
        <p className="mb-2 text-xs font-medium text-muted">Topics to study: tick the ones to add to your study plan</p>
        <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-surface">
          {guide.topics.map((topic) => (
            <li key={topic.name}>
              <label className={`flex gap-3 px-3.5 py-3 ${topic.added ? "" : "cursor-pointer hover:bg-sunken"}`}>
                {topic.added ? (
                  <Check className="mt-0.5 size-4 shrink-0 text-good" aria-label="Added to study plan" />
                ) : (
                  <input type="checkbox" checked={picked.has(topic.name)} onChange={() => toggle(topic.name)} className="mt-1 size-4 shrink-0 accent-current" />
                )}
                <span className="min-w-0 flex-1 text-sm">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-medium text-ink">{topic.name}</span>
                    <span className={`text-xs ${PRIORITY[topic.priority]}`}>{topic.priority} priority</span>
                    {topic.on_resume && <span className="text-xs text-muted">on your résumé</span>}
                    {topic.added && <span className="text-xs text-good">in study plan</span>}
                  </span>
                  <span className="mt-0.5 block text-muted">{topic.why}</span>
                  {topic.cover.length > 0 && (
                    <ul className="mt-1 list-disc pl-4 text-ink-soft marker:text-faint">
                      {topic.cover.map((point) => (
                        <li key={point}>{point}</li>
                      ))}
                    </ul>
                  )}
                </span>
              </label>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div className="w-40">
            <Field label="Interview on" hint="Optional">
              <Input type="date" value={interviewOn} onChange={(event) => setInterviewOn(event.target.value)} />
            </Field>
          </div>
          <Button variant="primary" size="md" disabled={picked.size === 0 || adding.busy} onClick={add}>
            Add {picked.size || ""} to study plan
          </Button>
        </div>
        <p className="mt-1.5 text-xs text-muted">Each topic gets a reminder to study it, spread over the days before the interview.</p>
      </div>

      {guide.questions.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted">Likely questions</p>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-soft marker:text-faint">
            {guide.questions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ol>
        </div>
      )}

      {guide.gaps.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted">Asked for, but not on your résumé</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-ink-soft marker:text-faint">
            {guide.gaps.map((gap) => (
              <li key={gap}>{gap}</li>
            ))}
          </ul>
        </div>
      )}

      <Button variant="ghost" disabled={busy} onClick={onRegenerate}>
        <RefreshCw className="size-3.5" aria-hidden /> {busy ? "Making a new guide…" : "Make a new guide"}
      </Button>
    </div>
  );
}
