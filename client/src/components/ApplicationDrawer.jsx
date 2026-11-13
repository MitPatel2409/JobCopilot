import { useEffect, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { sendJson } from "../api/client";
import { useFetch } from "../hooks/useFetch";
import { describeApplication, formatDate } from "../utils/format";
import ContactsSection from "./application/ContactsSection";
import DetailsSection from "./application/DetailsSection";
import JobDescriptionSection from "./application/JobDescriptionSection";
import MessagesSection from "./application/MessagesSection";
import PrepGuideSection from "./application/PrepGuideSection";
import ResumeSection from "./application/ResumeSection";
import StatusDialog from "./application/StatusDialog";
import TimelineSection from "./application/TimelineSection";
import NewReminderDialog from "./NewReminderDialog";
import ReminderRow from "./ReminderRow";
import { Button, ConfirmDialog, Empty, IconButton, List, LoadState, SectionTitle, StatusBadge } from "./ui";

/** Side panel with everything about one application, all editable by hand. */
export default function ApplicationDrawer({ id, refreshKey, onClose, onChanged, onError, onNotice, onInterview }) {
  const { data, loading, error } = useFetch(`/applications/${id}`, refreshKey);
  const connectors = useFetch("/connectors");
  const [dialog, setDialog] = useState(null); // { kind: "status", status } | { kind: "delete" } | { kind: "reminder" }

  useEffect(() => {
    const onKey = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save(body) {
    try {
      await sendJson(`/applications/${id}`, "PATCH", body);
      onChanged();
    } catch (saveError) {
      onError(saveError.message);
    }
  }

  async function remove() {
    setDialog(null);
    try {
      await sendJson(`/applications/${id}`, "DELETE");
      onClose();
      onChanged();
    } catch (removeError) {
      onError(removeError.message);
    }
  }

  const canSaveToGmail = Boolean(connectors.data?.connectors.find((c) => c.id === "gmail_drafts")?.connected);

  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-black/40" onMouseDown={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Application details"
        className="flex h-full w-full max-w-2xl flex-col border-l border-line bg-canvas shadow-xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-center gap-3 border-b border-line bg-surface px-5 py-3.5">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold text-ink">{data ? describeApplication(data.application) : "…"}</h2>
            {data && (
              <p className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                <StatusBadge status={data.application.status} />
                <span>Applied {formatDate(data.application.applied_on)}</span>
                {data.application.interview_on && <span>· Interview {formatDate(data.application.interview_on)}</span>}
              </p>
            )}
          </div>
          <IconButton label="Close" onClick={onClose}>
            <X className="size-4" aria-hidden />
          </IconButton>
        </header>

        <div className="flex-1 space-y-8 overflow-y-auto px-5 py-5">
          {!data ? (
            <LoadState loading={loading} error={error} />
          ) : (
            <>
              <DetailsSection
                key={data.application.updated_at}
                application={data.application}
                onSave={save}
                onStatus={(status) => status !== data.application.status && setDialog({ kind: "status", status })}
              />
              <JobDescriptionSection key={`jd-${data.application.jd_saved_at}`} application={data.application} onChanged={onChanged} onError={onError} />
              <ResumeSection application={data.application} resume={data.resume} baseResume={data.baseResume} onChanged={onChanged} onError={onError} />
              {(data.application.status === "interview" || data.application.status === "offer" || data.prepGuide) && (
                <PrepGuideSection
                  application={data.application}
                  guide={data.prepGuide}
                  resume={data.resume}
                  onChanged={onChanged}
                  onError={onError}
                  onAdded={(count) => onNotice("Added to your study plan", `${count} ${count === 1 ? "topic" : "topics"} with study reminders`)}
                />
              )}
              <TimelineSection events={data.statusEvents} />
              <ContactsSection application={data.application} contacts={data.contacts} onChanged={onChanged} onError={onError} />
              <MessagesSection
                application={data.application}
                items={data.outreach}
                contacts={data.contacts}
                canSaveToGmail={canSaveToGmail}
                onChanged={onChanged}
                onError={onError}
              />
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <SectionTitle count={data.reminders.length}>Reminders</SectionTitle>
                  <Button variant="ghost" onClick={() => setDialog({ kind: "reminder" })}>
                    <Plus className="size-3.5" aria-hidden /> Add
                  </Button>
                </div>
                {data.reminders.length === 0 ? (
                  <Empty>No reminders.</Empty>
                ) : (
                  <List>
                    {data.reminders.map((reminder) => (
                      <ReminderRow key={reminder.id} reminder={reminder} onChanged={onChanged} onError={onError} />
                    ))}
                  </List>
                )}
              </section>
              <Button variant="danger" onClick={() => setDialog({ kind: "delete" })}>
                <Trash2 className="size-3.5" aria-hidden /> Delete application
              </Button>
            </>
          )}
        </div>
      </aside>

      {dialog?.kind === "status" && (
        <StatusDialog
          application={data.application}
          status={dialog.status}
          onClose={() => setDialog(null)}
          onSaved={(status) => {
            setDialog(null);
            onChanged();
            if (status === "interview" && !data.prepGuide) onInterview(id);
          }}
        />
      )}
      {dialog?.kind === "reminder" && (
        <NewReminderDialog
          applicationId={id}
          onClose={() => setDialog(null)}
          onCreated={() => {
            setDialog(null);
            onChanged();
          }}
        />
      )}
      {dialog?.kind === "delete" && (
        <ConfirmDialog title="Delete this application?" confirmLabel="Delete" onConfirm={remove} onClose={() => setDialog(null)}>
          Its job description, résumé, contacts, messages, prep guide and reminders are deleted with it. This can&apos;t be undone.
        </ConfirmDialog>
      )}
    </div>
  );
}
