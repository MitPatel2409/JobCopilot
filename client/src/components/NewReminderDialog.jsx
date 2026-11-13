import { useState } from "react";
import { useFetch } from "../hooks/useFetch";
import { useSubmit } from "../hooks/useSubmit";
import { describeApplication, localDatePlus } from "../utils/format";
import FormDialog from "./FormDialog";
import { Field, Input, Select } from "./ui";

/** Adds a reminder without the assistant, optionally linked to an application. */
export default function NewReminderDialog({ applicationId = "", onClose, onCreated }) {
  const [form, setForm] = useState({ message: "", date: localDatePlus(1), time: "09:00", application_id: String(applicationId) });
  const applications = useFetch("/applications");
  const { saving, error, submit } = useSubmit();
  const set = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));

  async function save() {
    const result = await submit("/reminders", {
      message: form.message,
      due: `${form.date}T${form.time || "09:00"}`,
      application_id: form.application_id || undefined,
    });
    if (result) onCreated(result);
  }

  return (
    <FormDialog
      title="New reminder"
      submitLabel="Add reminder"
      saving={saving}
      error={error}
      canSubmit={Boolean(form.message.trim() && form.date)}
      onSubmit={save}
      onClose={onClose}
    >
      <Field label="Remind me to">
        <Input value={form.message} onChange={set("message")} placeholder="e.g. Send a thank-you note" maxLength={300} autoFocus required />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date">
          <Input type="date" value={form.date} min={localDatePlus(0)} onChange={set("date")} required />
        </Field>
        <Field label="Time">
          <Input type="time" value={form.time} onChange={set("time")} />
        </Field>
      </div>
      <Field label="About an application" hint="Optional">
        <Select value={form.application_id} onChange={set("application_id")}>
          <option value="">None</option>
          {(applications.data?.applications ?? []).map((application) => (
            <option key={application.id} value={application.id}>
              {describeApplication(application)}
            </option>
          ))}
        </Select>
      </Field>
    </FormDialog>
  );
}
