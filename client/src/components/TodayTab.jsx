import { Hourglass, Mail, MoonStar } from "lucide-react";
import { sendJson } from "../api/client";
import { useAction } from "../hooks/useAction";
import { useFetch } from "../hooks/useFetch";
import { daysSince, describeApplication, formatDateTime, formatShortDate, isOverdue, localDatePlus } from "../utils/format";
import { STATUSES, statusInfo } from "../utils/status";
import ReminderRow from "./ReminderRow";
import ResumeInbox from "./ResumeInbox";
import Stat from "./Stat";
import { Button, Card, Empty, List, LoadState, SectionTitle, Select } from "./ui";

export default function TodayTab({ refreshKey, onError, onNotice, onChanged, onOpen, onInterview }) {
  const { data, loading, error } = useFetch("/today", refreshKey);
  if (!data) return <LoadState loading={loading} error={error} />;

  const overdue = data.due.filter((reminder) => isOverdue(reminder.due_at)).length;

  return (
    <div className="space-y-7">
      <div className="grid grid-cols-3 gap-3">
        <Stat
          label="Due now"
          value={data.due.length}
          hint={overdue > 0 ? `${overdue} overdue` : "Nothing overdue"}
          tone={overdue > 0 ? "text-danger" : "text-ink"}
        />
        <Stat label="Next 7 days" value={data.upcoming.length} hint="Scheduled" />
        <Stat label="Applied this week" value={data.appliedThisWeek} hint="Since Monday" />
      </div>

      {data.replies.length > 0 && (
        <section>
          <SectionTitle count={data.replies.length}>Recruiter replies</SectionTitle>
          <List>
            {data.replies.map((reply) => (
              <ReplyRow key={reply.id} reply={reply} onChanged={onChanged} onError={onError} onOpen={onOpen} onInterview={onInterview} />
            ))}
          </List>
        </section>
      )}

      {data.resumeFiles.length > 0 && <ResumeInbox files={data.resumeFiles} onChanged={onChanged} onError={onError} onNotice={onNotice} />}

      {data.quiet.length > 0 && (
        <section>
          <SectionTitle count={data.quiet.length}>No news for 3 weeks</SectionTitle>
          <List>
            {data.quiet.map((application) => (
              <QuietRow key={application.id} application={application} onChanged={onChanged} onError={onError} onOpen={onOpen} />
            ))}
          </List>
        </section>
      )}

      {data.nudge && (
        <Card className="flex items-start gap-3 px-4 py-3 text-sm text-ink-soft">
          <MoonStar className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
          Nothing logged today yet. Add a line in the Journal or tell the assistant what you worked on, even if it was small.
        </Card>
      )}

      <section>
        <SectionTitle count={data.due.length}>Due now</SectionTitle>
        {data.due.length === 0 ? (
          <Empty>Nothing due today. Follow-ups and revisions show up here when they&apos;re due.</Empty>
        ) : (
          <List>
            {data.due.map((reminder) => (
              <ReminderRow key={reminder.id} reminder={reminder} onChanged={onChanged} onError={onError} />
            ))}
          </List>
        )}
      </section>

      <section>
        <SectionTitle count={data.upcoming.length}>Next 7 days</SectionTitle>
        {data.upcoming.length === 0 ? (
          <Empty>Nothing scheduled this week.</Empty>
        ) : (
          <List>
            {data.upcoming.map((reminder) => (
              <ReminderRow key={reminder.id} reminder={reminder} onChanged={onChanged} onError={onError} />
            ))}
          </List>
        )}
      </section>

      {data.journal && (
        <section>
          <SectionTitle>Logged today</SectionTitle>
          <Card className="px-4 py-3">
            <ul className="list-disc space-y-1 pl-4 text-sm text-ink-soft marker:text-faint">
              {data.journal.summary.split("\n").map((line, index) => (
                <li key={index}>{line}</li>
              ))}
            </ul>
          </Card>
        </section>
      )}
    </div>
  );
}

/** An application with no news for weeks: follow up once more, or call it. */
function QuietRow({ application, onChanged, onError, onOpen }) {
  const { busy, run } = useAction(onError);

  async function act(fn) {
    if (await run(fn)) onChanged();
  }

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-2.5">
      <Hourglass className="size-4 shrink-0 text-faint" aria-hidden />
      <div className="min-w-40 flex-1">
        <button type="button" onClick={() => onOpen(application.id)} className="text-left text-sm text-ink hover:underline">
          {describeApplication(application)}
        </button>
        <p className="text-xs text-muted">
          Applied {formatShortDate(application.applied_on)} · {daysSince(application.applied_on)} days ago
        </p>
      </div>
      <div className="flex items-center gap-1.5">
        <Button
          disabled={busy}
          onClick={() =>
            act(() =>
              sendJson("/reminders", "POST", {
                message: `Follow up on ${describeApplication(application)}`,
                due: localDatePlus(1),
                application_id: application.id,
              }),
            )
          }
        >
          Follow up tomorrow
        </Button>
        <Button variant="ghost" disabled={busy} onClick={() => act(() => sendJson(`/applications/${application.id}`, "PATCH", { status: "ghosted" }))}>
          Mark no reply
        </Button>
      </div>
    </li>
  );
}

/** Mail from a saved recruiter: confirm what it means for the application, or dismiss it. */
function ReplyRow({ reply, onChanged, onError, onOpen, onInterview }) {
  const { busy, run } = useAction(onError);
  const suggestion = reply.suggested_status;

  async function apply(status) {
    const result = await run(() => sendJson(`/mail-matches/${reply.id}/apply`, "POST", { status }));
    if (!result) return;
    onChanged();
    if (result.application.status === "interview") onInterview(reply.application_id);
  }

  async function dismiss() {
    if (await run(() => sendJson(`/mail-matches/${reply.id}/dismiss`, "POST"))) onChanged();
  }

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-2.5">
      <Mail className="size-4 shrink-0 text-faint" aria-hidden />
      <div className="min-w-40 flex-1">
        <p className="text-sm text-ink">
          <button type="button" onClick={() => onOpen(reply.application_id)} className="font-medium hover:underline">
            {describeApplication(reply)}
          </button>
          <span className="text-muted"> · {reply.contact_name ?? reply.sender}</span>
        </p>
        <p className="truncate text-sm text-ink-soft">{reply.subject || "(no subject)"}</p>
        <p className="truncate text-xs text-muted">
          {formatDateTime(reply.received_at)}
          {reply.snippet && ` · ${reply.snippet}`}
        </p>
      </div>
      <div className="flex items-center gap-1.5">
        {suggestion ? (
          <Button variant="primary" disabled={busy} onClick={() => apply(suggestion)}>
            Mark as {statusInfo(suggestion).label}
          </Button>
        ) : (
          <Select
            value=""
            disabled={busy}
            onChange={(event) => apply(event.target.value)}
            aria-label="Mark the application as"
            className="!w-auto py-1 text-xs"
          >
            <option value="" disabled>
              Mark as…
            </option>
            {STATUSES.filter((status) => status.value !== reply.application_status).map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </Select>
        )}
        <Button variant="ghost" disabled={busy} onClick={dismiss}>
          Dismiss
        </Button>
      </div>
    </li>
  );
}
