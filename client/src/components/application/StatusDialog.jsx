import { useState } from "react";
import { sendJson } from "../../api/client";
import { describeApplication } from "../../utils/format";
import { statusInfo } from "../../utils/status";
import FormDialog from "../FormDialog";
import { Field, Input, Textarea } from "../ui";

/** Moves an application to `status`, with an optional note for its history (and the date, for an interview). */
export default function StatusDialog({ application, status, onClose, onSaved }) {
  const [note, setNote] = useState("");
  const [interviewOn, setInterviewOn] = useState(application.interview_on ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const body = { status, note };
      if (status === "interview" && interviewOn) body.interview_on = interviewOn;
      await sendJson(`/applications/${application.id}`, "PATCH", body);
      onSaved(status);
    } catch (patchError) {
      setError(patchError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormDialog
      title={`Move ${describeApplication(application)} to ${statusInfo(status).label}`}
      submitLabel="Save"
      saving={saving}
      error={error}
      onSubmit={save}
      onClose={onClose}
    >
      {status === "interview" && (
        <Field label="Interview on" hint="Optional">
          <Input type="date" value={interviewOn} onChange={(event) => setInterviewOn(event.target.value)} />
        </Field>
      )}
      <Field label="Note" hint="Optional, kept in the history">
        <Textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={3}
          maxLength={1000}
          placeholder={status === "interview" ? "e.g. Technical round with the data team" : "e.g. Rejection email from the recruiter"}
          autoFocus
        />
      </Field>
    </FormDialog>
  );
}
