import { useRef } from "react";
import { Download, FileText, Trash2, Upload } from "lucide-react";
import { apiUrl, sendJson, uploadFile } from "../../api/client";
import { useAction } from "../../hooks/useAction";
import { fileSize, formatDateTime } from "../../utils/format";
import { Button, Card, Empty, SectionTitle } from "../ui";
import ResumeReuse from "./ResumeReuse";

const RESUME_TYPES = ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * One résumé file: shows it with Download / Replace / Remove, or an Upload
 * button. Used for the tailored résumé on an application and the base one in Settings.
 */
export function ResumeFile({ resume, path, empty, onChanged, onError }) {
  const inputRef = useRef(null);
  const { busy, run } = useAction(onError);

  async function upload(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file && (await run(() => uploadFile(path, file)))) onChanged();
  }

  async function remove() {
    if ((await run(() => sendJson(path, "DELETE"))) !== null) onChanged();
  }

  const picker = <input ref={inputRef} type="file" accept={RESUME_TYPES} className="hidden" onChange={upload} />;

  if (!resume) {
    return (
      <div className="space-y-2">
        <Empty>{empty}</Empty>
        <Button variant="primary" disabled={busy} onClick={() => inputRef.current.click()}>
          <Upload className="size-3.5" aria-hidden /> {busy ? "Uploading…" : "Upload PDF or Word"}
        </Button>
        {picker}
      </div>
    );
  }

  return (
    <Card className="flex flex-wrap items-center gap-3 p-3.5">
      <FileText className="size-5 shrink-0 text-faint" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{resume.filename}</p>
        <p className="text-xs text-muted">
          {fileSize(resume.size)} · uploaded {formatDateTime(resume.created_at)}
          {resume.text_length === 0 && " · no text found (a scanned PDF?)"}
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <a
          href={apiUrl(path)}
          className="inline-flex items-center gap-1.5 rounded-md border border-line-strong bg-surface px-2.5 py-1 text-xs font-medium text-ink-soft hover:bg-sunken"
        >
          <Download className="size-3.5" aria-hidden /> Download
        </a>
        <Button disabled={busy} onClick={() => inputRef.current.click()}>
          <Upload className="size-3.5" aria-hidden /> Replace
        </Button>
        <Button variant="ghost" disabled={busy} onClick={remove} aria-label="Remove résumé">
          <Trash2 className="size-3.5" aria-hidden />
        </Button>
      </div>
      {picker}
    </Card>
  );
}

/** The résumé sent for this application: uploaded, or reused from another application. */
export default function ResumeSection({ application, resume, baseResume, onChanged, onError }) {
  const { busy, run } = useAction(onError);

  async function reuse(from) {
    if (from === "") return;
    const result = await run(() => sendJson(`/applications/${application.id}/resume/copy`, "POST", { from_application_id: from }));
    if (result) onChanged();
  }

  return (
    <section>
      <SectionTitle>Résumé sent</SectionTitle>
      <ResumeFile
        resume={resume}
        path={`/applications/${application.id}/resume`}
        empty={
          baseResume
            ? `Keep the version you tailored for this job. Until then, the prep guide uses your base résumé (${baseResume.filename}).`
            : "Keep the version you tailored for this job. It is also what the prep guide compares with the job description."
        }
        onChanged={onChanged}
        onError={onError}
      />
      <div className="mt-2 max-w-md">
        <ResumeReuse
          company={application.company}
          excludeId={application.id}
          disabled={busy}
          onPick={reuse}
          label={resume ? "Replace with the résumé from…" : "Or use the same résumé as…"}
        />
      </div>
    </section>
  );
}
