import { useState } from "react";
import { useFetch } from "../hooks/useFetch";
import { useSubmit } from "../hooks/useSubmit";
import { localDatePlus } from "../utils/format";
import FormDialog from "./FormDialog";
import { Field, Input, Textarea } from "./ui";

/** Logs a study session without the assistant. A new topic gets revisions after 1, 3, 7 and 21 days. */
export default function NewTopicDialog({ onClose, onCreated }) {
  const [form, setForm] = useState({ name: "", note: "", studied_on: localDatePlus(0) });
  const topics = useFetch("/topics");
  const { saving, error, submit } = useSubmit();
  const set = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));

  async function save() {
    const result = await submit("/topics", form);
    if (result) onCreated(result);
  }

  return (
    <FormDialog
      title="Log study session"
      submitLabel="Log session"
      saving={saving}
      error={error}
      canSubmit={Boolean(form.name.trim() && form.studied_on)}
      onSubmit={save}
      onClose={onClose}
    >
      <Field label="Topic">
        <Input value={form.name} onChange={set("name")} list="topic-names" placeholder="e.g. Docker" maxLength={120} autoFocus required />
        <datalist id="topic-names">
          {(topics.data?.topics ?? []).map((topic) => (
            <option key={topic.id} value={topic.name} />
          ))}
        </datalist>
      </Field>
      <Field label="What you covered" hint="Optional">
        <Textarea value={form.note} onChange={set("note")} rows={4} placeholder="What you learned, a command, a gotcha…" />
      </Field>
      <Field label="Studied on">
        <Input type="date" value={form.studied_on} max={localDatePlus(0)} onChange={set("studied_on")} required />
      </Field>
    </FormDialog>
  );
}
