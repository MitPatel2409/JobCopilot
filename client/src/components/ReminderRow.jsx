import { useState } from "react";
import { Bell, BookOpen, Briefcase, CalendarPlus, Check, Clock, ExternalLink, Pencil, Trash2 } from "lucide-react";
import { sendJson } from "../api/client";
import { formatDateTime, isOverdue, localDatePlus, localParts } from "../utils/format";
import FormDialog from "./FormDialog";
import { Button, ConfirmDialog, Field, Input, Menu } from "./ui";

const KIND_ICONS = { follow_up: Briefcase, revision: BookOpen, custom: Bell };

const SNOOZE_OPTIONS = [
  { label: "Tomorrow", days: 1 },
  { label: "In 3 days", days: 3 },
  { label: "Next week", days: 7 },
];

/**
 * Google Calendar's own "new event" page, filled in with this reminder:
 * adding it to the calendar needs no Google setup at all.
 */
function addToGoogleCalendarUrl(reminder) {
  const stamp = (date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const start = new Date(reminder.due_at);
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: reminder.message,
    dates: `${stamp(start)}/${stamp(end)}`,
    details: [reminder.url && `Job posting: ${reminder.url}`, "From Job-Copilot"].filter(Boolean).join("\n"),
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

/** One reminder with Done, Snooze, Edit and Delete. `onChanged` reloads the list after an action. */
export default function ReminderRow({ reminder, onChanged, onError }) {
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState(null); // "edit" | "delete"
  const Icon = KIND_ICONS[reminder.kind] ?? Bell;
  const overdue = reminder.status === "pending" && isOverdue(reminder.due_at);

  async function act(method, path, body) {
    setBusy(true);
    try {
      await sendJson(`/reminders/${reminder.id}${path}`, method, body);
      onChanged();
    } catch (error) {
      onError?.(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-2.5">
      <Icon className="size-4 shrink-0 text-faint" aria-hidden />
      <div className="min-w-40 flex-1">
        <p className="text-sm text-ink">{reminder.message}</p>
        <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
          <span className={overdue ? "font-medium text-danger" : ""}>
            {overdue ? "Overdue · " : ""}
            {formatDateTime(reminder.due_at)}
          </span>
          {reminder.url && (
            <a href={reminder.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-ink-soft underline-offset-2 hover:underline">
              posting <ExternalLink className="size-3" aria-hidden />
            </a>
          )}
        </p>
      </div>
      {reminder.status === "pending" && (
        <div className="flex items-center gap-1.5">
          <Button disabled={busy} onClick={() => act("POST", "/done")}>
            <Check className="size-3.5" aria-hidden /> Done
          </Button>
          <label className="sr-only" htmlFor={`snooze-${reminder.id}`}>
            Snooze
          </label>
          <div className="relative">
            <Clock className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted" aria-hidden />
            <select
              id={`snooze-${reminder.id}`}
              disabled={busy}
              value=""
              onChange={(event) => act("POST", "/snooze", { until: localDatePlus(Number(event.target.value)) })}
              className="appearance-none rounded-md border border-line-strong bg-surface py-1 pl-7 pr-2 text-xs font-medium text-ink-soft hover:bg-sunken"
            >
              <option value="" disabled>
                Snooze
              </option>
              {SNOOZE_OPTIONS.map((option) => (
                <option key={option.days} value={option.days}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
      {reminder.status !== "pending" && <span className="text-xs capitalize text-faint">{reminder.status}</span>}
      <Menu
        label="Reminder actions"
        items={[
          ...(reminder.status === "pending" ? [{ label: "Edit", icon: Pencil, onSelect: () => setDialog("edit") }] : []),
          // Not needed when Calendar is connected: the reminder is already an event there.
          ...(reminder.status === "pending" && !reminder.calendar_event_id
            ? [{ label: "Add to Google Calendar", icon: CalendarPlus, onSelect: () => window.open(addToGoogleCalendarUrl(reminder), "_blank", "noopener") }]
            : []),
          { label: "Delete", icon: Trash2, danger: true, onSelect: () => setDialog("delete") },
        ]}
      />

      {dialog === "edit" && (
        <EditReminderDialog
          reminder={reminder}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            onChanged();
          }}
        />
      )}
      {dialog === "delete" && (
        <ConfirmDialog
          title="Delete this reminder?"
          confirmLabel="Delete"
          onConfirm={() => {
            setDialog(null);
            act("DELETE", "");
          }}
          onClose={() => setDialog(null)}
        >
          {reminder.calendar_event_id ? "Its Google Calendar event is removed too." : "This can't be undone."}
        </ConfirmDialog>
      )}
    </li>
  );
}

function EditReminderDialog({ reminder, onClose, onSaved }) {
  const [date, time] = localParts(reminder.due_at);
  const [form, setForm] = useState({ message: reminder.message, date, time });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const set = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const moved = form.date !== date || form.time !== time;
      await sendJson(`/reminders/${reminder.id}`, "PATCH", { message: form.message, due: moved ? `${form.date}T${form.time || "09:00"}` : undefined });
      onSaved();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormDialog title="Edit reminder" submitLabel="Save" saving={saving} error={error} canSubmit={Boolean(form.message.trim() && form.date)} onSubmit={save} onClose={onClose}>
      <Field label="Remind me to">
        <Input value={form.message} onChange={set("message")} maxLength={300} autoFocus required />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date">
          <Input type="date" value={form.date} min={localDatePlus(0)} onChange={set("date")} required />
        </Field>
        <Field label="Time">
          <Input type="time" value={form.time} onChange={set("time")} />
        </Field>
      </div>
    </FormDialog>
  );
}
