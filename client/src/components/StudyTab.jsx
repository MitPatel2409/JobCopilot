import { useState } from "react";
import { ArrowLeft, ChevronRight, Pencil, Trash2 } from "lucide-react";
import { sendJson } from "../api/client";
import { useAction } from "../hooks/useAction";
import { useFetch } from "../hooks/useFetch";
import { formatDate, formatDateTime } from "../utils/format";
import ReminderRow from "./ReminderRow";
import { Button, Card, ConfirmDialog, Empty, Input, List, LoadState, Menu, SectionTitle, Textarea } from "./ui";

export default function StudyTab({ refreshKey, onError, onChanged }) {
  const [selectedId, setSelectedId] = useState(null);
  const { data, loading, error } = useFetch("/topics", refreshKey);

  if (selectedId) {
    return <TopicDetail id={selectedId} refreshKey={refreshKey} onBack={() => setSelectedId(null)} onError={onError} onChanged={onChanged} />;
  }
  if (!data) return <LoadState loading={loading} error={error} />;

  return data.topics.length === 0 ? (
    <Empty>No topics yet. Log a study session and revisions are scheduled after 1, 3, 7 and 21 days.</Empty>
  ) : (
    <List>
      {data.topics.map((topic) => (
        <li key={topic.id}>
          <button type="button" onClick={() => setSelectedId(topic.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-sunken">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-ink">{topic.name}</span>
              <span className="text-xs text-muted">
                {topic.note_count === 0 && topic.plan ? "Planned, not studied yet" : `${topic.note_count} ${topic.note_count === 1 ? "note" : "notes"}`}
                {topic.last_studied && ` · studied ${formatDate(topic.last_studied)}`}
              </span>
            </span>
            <span className="hidden text-right text-xs text-muted sm:block">
              {topic.next_revision ? (
                <>
                  Next reminder
                  <span className="block text-ink-soft">{formatDateTime(topic.next_revision)}</span>
                </>
              ) : (
                "Nothing scheduled"
              )}
            </span>
            <ChevronRight className="size-4 shrink-0 text-faint" aria-hidden />
          </button>
        </li>
      ))}
    </List>
  );
}

function TopicDetail({ id, refreshKey, onBack, onError, onChanged }) {
  const { data, loading, error } = useFetch(`/topics/${id}`, refreshKey);
  const [note, setNote] = useState("");
  const [renaming, setRenaming] = useState(null);
  const [plan, setPlan] = useState(null); // null: not editing
  const [editingNote, setEditingNote] = useState(null); // { id, body }
  const [confirm, setConfirm] = useState(null); // { kind: "topic" } | { kind: "note", id }
  const { busy, run } = useAction(onError);

  async function act(fn, after) {
    if ((await run(fn)) !== null) {
      after?.();
      onChanged();
    }
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={onBack} className="-ml-2">
        <ArrowLeft className="size-3.5" aria-hidden /> All topics
      </Button>
      {!data ? (
        <LoadState loading={loading} error={error} />
      ) : (
        <>
          <div className="flex items-center gap-2">
            {renaming === null ? (
              <h2 className="flex-1 text-lg font-semibold text-ink">{data.topic.name}</h2>
            ) : (
              <form
                className="flex flex-1 gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  act(() => sendJson(`/topics/${id}`, "PATCH", { name: renaming }), () => setRenaming(null));
                }}
              >
                <Input value={renaming} onChange={(event) => setRenaming(event.target.value)} maxLength={120} aria-label="Topic name" autoFocus />
                <Button type="submit" variant="primary" disabled={busy || !renaming.trim()}>
                  Save
                </Button>
                <Button variant="ghost" onClick={() => setRenaming(null)}>
                  Cancel
                </Button>
              </form>
            )}
            <Menu
              label="Topic actions"
              items={[
                { label: "Rename", icon: Pencil, onSelect: () => setRenaming(data.topic.name) },
                { label: "Delete topic", icon: Trash2, danger: true, onSelect: () => setConfirm({ kind: "topic" }) },
              ]}
            />
          </div>

          <section>
            <SectionTitle>What to cover</SectionTitle>
            {plan !== null ? (
              <div className="space-y-2">
                <Textarea value={plan} onChange={(event) => setPlan(event.target.value)} rows={6} aria-label="What to cover" autoFocus />
                <div className="flex gap-2">
                  <Button variant="primary" disabled={busy} onClick={() => act(() => sendJson(`/topics/${id}`, "PATCH", { plan }), () => setPlan(null))}>
                    Save
                  </Button>
                  <Button variant="ghost" onClick={() => setPlan(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : data.topic.plan ? (
              <Card className="p-3.5">
                <p className="whitespace-pre-wrap text-sm text-ink-soft">{data.topic.plan}</p>
                <Button variant="ghost" className="mt-2 -ml-2" onClick={() => setPlan(data.topic.plan)}>
                  <Pencil className="size-3.5" aria-hidden /> Edit
                </Button>
              </Card>
            ) : (
              <button type="button" onClick={() => setPlan("")} className="w-full rounded-md border border-dashed border-line-strong px-4 py-3 text-left text-sm text-muted hover:bg-sunken">
                Add a plan: what you want to cover for this topic. Interview prep guides fill this in.
              </button>
            )}
          </section>

          <section>
            <SectionTitle>Reminders</SectionTitle>
            {data.reminders.length === 0 ? (
              <Empty>No reminders scheduled.</Empty>
            ) : (
              <List>
                {data.reminders.map((reminder) => (
                  <ReminderRow key={reminder.id} reminder={reminder} onChanged={onChanged} onError={onError} />
                ))}
              </List>
            )}
          </section>

          <section>
            <SectionTitle count={data.notes.length}>Notes</SectionTitle>
            <form
              className="mb-3 space-y-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (note.trim()) act(() => sendJson(`/topics/${id}/notes`, "POST", { body: note }), () => setNote(""));
              }}
            >
              <Textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} placeholder="What you learned, a command, a gotcha…" aria-label="New note" />
              <Button type="submit" variant="primary" disabled={busy || !note.trim()}>
                Add note
              </Button>
            </form>
            <ul className="space-y-2">
              {data.notes.map((item) => (
                <li key={item.id}>
                  <Card className="px-3.5 py-2.5 text-sm">
                    <div className="flex items-start gap-2">
                      <p className="flex-1 text-xs text-muted">{formatDate(item.studied_on)}</p>
                      <Menu
                        label="Note actions"
                        items={[
                          { label: "Edit", icon: Pencil, onSelect: () => setEditingNote({ id: item.id, body: item.body }) },
                          { label: "Delete", icon: Trash2, danger: true, onSelect: () => setConfirm({ kind: "note", id: item.id }) },
                        ]}
                      />
                    </div>
                    {editingNote?.id === item.id ? (
                      <div className="mt-1 space-y-2">
                        <Textarea value={editingNote.body} onChange={(event) => setEditingNote({ ...editingNote, body: event.target.value })} rows={4} aria-label="Edit note" autoFocus />
                        <div className="flex gap-2">
                          <Button
                            variant="primary"
                            disabled={busy || !editingNote.body.trim()}
                            onClick={() => act(() => sendJson(`/topics/${id}/notes/${item.id}`, "PATCH", { body: editingNote.body }), () => setEditingNote(null))}
                          >
                            Save
                          </Button>
                          <Button variant="ghost" onClick={() => setEditingNote(null)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-0.5 whitespace-pre-wrap text-ink-soft">{item.body}</p>
                    )}
                  </Card>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      {confirm?.kind === "topic" && (
        <ConfirmDialog
          title={`Delete ${data?.topic.name}?`}
          confirmLabel="Delete topic"
          onConfirm={() => {
            setConfirm(null);
            act(() => sendJson(`/topics/${id}`, "DELETE"), onBack);
          }}
          onClose={() => setConfirm(null)}
        >
          Its notes and reminders are deleted too. This can&apos;t be undone.
        </ConfirmDialog>
      )}
      {confirm?.kind === "note" && (
        <ConfirmDialog
          title="Delete this note?"
          confirmLabel="Delete"
          onConfirm={() => {
            const noteId = confirm.id;
            setConfirm(null);
            act(() => sendJson(`/topics/${id}/notes/${noteId}`, "DELETE"));
          }}
          onClose={() => setConfirm(null)}
        >
          This can&apos;t be undone.
        </ConfirmDialog>
      )}
    </div>
  );
}
