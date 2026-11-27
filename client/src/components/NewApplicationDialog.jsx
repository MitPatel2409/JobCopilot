import { useRef, useState } from "react";
import { sendJson, uploadFile } from "../api/client";
import { useSubmit } from "../hooks/useSubmit";
import { localDatePlus } from "../utils/format";
import ResumeReuse from "./application/ResumeReuse";
import FormDialog from "./FormDialog";
import { Field, Input, Textarea } from "./ui";

/**
 * Adds an application without the assistant. The follow-up reminder is
 * scheduled as usual. The résumé can be uploaded, or reused from another application.
 * `inboxFile` (a file the résumé folder watcher found) is attached as the résumé instead,
 * and `initial` prefills fields.
 */
export default function NewApplicationDialog({ onClose, onCreated, initial = {}, inboxFile = null }) {
  const [form, setForm] = useState({ company: "", role: "", url: "", applied_on: localDatePlus(0), notes: "", ...initial });
  const [resumeFrom, setResumeFrom] = useState(""); // "" none, null base résumé, or an application id
  const [file, setFile] = useState(null);
  const [resumeError, setResumeError] = useState(null);
  const fileRef = useRef(null);
  const { saving, error, submit } = useSubmit();
  const set = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));

  async function save() {
    setResumeError(null);
    const result = await submit("/applications", form);
    if (!result) return;
    try {
      const id = result.application.id;
      if (inboxFile) await sendJson(`/resume-inbox/${inboxFile.id}/attach`, "POST", { application_id: id });
      else if (file) await uploadFile(`/applications/${id}/resume`, file);
      else if (resumeFrom !== "") await sendJson(`/applications/${id}/resume/copy`, "POST", { from_application_id: resumeFrom });
    } catch (attachError) {
      setResumeError(`The application was added, but the résumé was not: ${attachError.message}`);
      return;
    }
    onCreated(result);
  }

  return (
    <FormDialog
      title="New application"
      submitLabel="Add application"
      saving={saving}
      error={error ?? resumeError}
      canSubmit={Boolean(form.company.trim() && form.applied_on)}
      onSubmit={save}
      onClose={onClose}
    >
      <Field label="Company">
        <Input value={form.company} onChange={set("company")} placeholder="e.g. RBC" autoFocus required />
      </Field>
      <Field label="Role" hint="Optional">
        <Input value={form.role} onChange={set("role")} placeholder="e.g. Software Developer Intern" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
        <Field label="Job posting" hint="Optional">
          <Input value={form.url} onChange={set("url")} placeholder="https://…" />
        </Field>
        <Field label="Applied on">
          <Input type="date" value={form.applied_on} max={localDatePlus(0)} onChange={set("applied_on")} required />
        </Field>
      </div>
      {inboxFile ? (
        <p className="text-sm text-ink-soft">
          Résumé sent: <span className="font-medium text-ink">{inboxFile.filename}</span> (from your résumé folder)
        </p>
      ) : (
      <div className="text-sm">
        <span className="mb-1 flex items-baseline justify-between font-medium text-ink-soft">
          Résumé sent <span className="text-xs font-normal text-muted">Optional</span>
        </span>
        {file ? (
          <p className="flex items-center gap-2 rounded-md border border-line-strong px-2.5 py-1.5 text-ink-soft">
            <span className="min-w-0 flex-1 truncate">{file.name}</span>
            <button type="button" onClick={() => setFile(null)} className="text-xs text-muted hover:text-ink">
              Remove
            </button>
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-0 flex-1">
              <ResumeReuse company={form.company} value={resumeFrom === null ? "base" : resumeFrom} onPick={setResumeFrom} />
            </div>
            <button type="button" onClick={() => fileRef.current.click()} className="text-xs font-medium text-ink-soft underline-offset-2 hover:underline">
              Upload a file
            </button>
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.docx"
          className="hidden"
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            setResumeFrom("");
            event.target.value = "";
          }}
        />
      </div>
      )}
      <Field label="Notes" hint="Optional">
        <Textarea value={form.notes} onChange={set("notes")} rows={3} />
      </Field>
    </FormDialog>
  );
}
