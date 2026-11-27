import { useState } from "react";
import { FileText } from "lucide-react";
import { sendJson } from "../api/client";
import { useAction } from "../hooks/useAction";
import { useFetch } from "../hooks/useFetch";
import { describeApplication, fileSize, formatDateTime } from "../utils/format";
import NewApplicationDialog from "./NewApplicationDialog";
import { Button, List, SectionTitle, Select } from "./ui";

/**
 * Résumés the folder watcher found, waiting for the user to say which
 * application they belong to. Nothing is attached until a button is clicked,
 * except what "attach automatically" in Settings did (with Undo).
 */
export default function ResumeInbox({ files, onChanged, onError, onNotice }) {
  const { busy, run } = useAction(onError);
  const [creating, setCreating] = useState(null);

  async function ignoreAll() {
    if (await run(() => sendJson("/resume-inbox/ignore-all", "POST"))) onChanged();
  }

  return (
    <section>
      <SectionTitle count={files.length}>New résumés in your folder</SectionTitle>
      <List>
        {files.map((file) => (
          <FileRow key={file.id} file={file} onChanged={onChanged} onError={onError} onNotice={onNotice} onCreate={() => setCreating(file)} />
        ))}
      </List>
      {files.length > 3 && (
        <div className="mt-2 flex justify-end">
          <Button variant="ghost" disabled={busy} onClick={ignoreAll}>
            Ignore all {files.length}
          </Button>
        </div>
      )}
      {creating && (
        <NewApplicationDialog
          initial={{ company: creating.suggested_name }}
          inboxFile={creating}
          onClose={() => setCreating(null)}
          onCreated={() => {
            setCreating(null);
            onChanged();
            onNotice("Application added", `${creating.filename} is its résumé`);
          }}
        />
      )}
    </section>
  );
}

function FileRow({ file, onChanged, onError, onNotice, onCreate }) {
  const { busy, run } = useAction(onError);
  const [picking, setPicking] = useState(false);

  async function attach(application) {
    const result = await run(() => sendJson(`/resume-inbox/${file.id}/attach`, "POST", { application_id: application.application_id ?? application.id }));
    if (!result) return;
    onChanged();
    onNotice("Résumé attached", `${file.filename} → ${describeApplication(application)}`);
  }

  async function ignore() {
    if (await run(() => sendJson(`/resume-inbox/${file.id}/ignore`, "POST"))) onChanged();
  }

  return (
    <li className="space-y-2 px-3.5 py-2.5">
      <div className="flex items-start gap-3">
        <FileText className="mt-0.5 size-4 shrink-0 text-faint" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">
            {file.folder && <span className="font-normal text-muted">{file.folder} / </span>}
            {file.filename}
          </p>
          <p className="text-xs text-muted">
            {fileSize(file.size)} · saved {formatDateTime(file.modified_at)}
            {file.guesses.length === 0 && " · no application matches this name"}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 pl-7">
        {file.guesses.map((guess, index) => (
          <Button key={guess.application_id} variant={index === 0 && file.sure ? "primary" : "secondary"} disabled={busy} onClick={() => attach(guess)}>
            {guess.resume_filename ? "Replace résumé for" : "Attach to"} {describeApplication(guess)}
          </Button>
        ))}
        {picking ? (
          <ApplicationPicker disabled={busy} onPick={attach} />
        ) : (
          <Button disabled={busy} onClick={() => setPicking(true)}>
            Another application…
          </Button>
        )}
        <Button disabled={busy} onClick={onCreate}>
          New application
        </Button>
        <Button variant="ghost" disabled={busy} onClick={ignore}>
          Ignore
        </Button>
      </div>
    </li>
  );
}

/** Every application, those without a résumé first. Only loaded once asked for. */
function ApplicationPicker({ disabled, onPick }) {
  const { data } = useFetch("/applications", 0);
  const applications = [...(data?.applications ?? [])].sort((a, b) => Boolean(a.resume_filename) - Boolean(b.resume_filename));

  return (
    <Select
      value=""
      disabled={disabled || !data}
      autoFocus
      onChange={(event) => onPick(applications.find((application) => String(application.id) === event.target.value))}
      aria-label="Attach to application"
      className="!w-auto py-1 text-xs"
    >
      <option value="" disabled>
        {data ? "Choose application…" : "Loading…"}
      </option>
      {applications.map((application) => (
        <option key={application.id} value={application.id}>
          {describeApplication(application)}
          {application.resume_filename ? " (has a résumé)" : ""}
        </option>
      ))}
    </Select>
  );
}
