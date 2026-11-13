import { useState } from "react";
import { Download, Pencil } from "lucide-react";
import { sendJson } from "../../api/client";
import { useAction } from "../../hooks/useAction";
import { formatDateTime } from "../../utils/format";
import { Button, Card, Empty, SectionTitle, Textarea } from "../ui";

const PREVIEW_CHARS = 600;

/**
 * The job description, kept on the application so it survives the posting
 * going offline. Paste it, or fetch it from the posting link and check it before saving.
 */
export default function JobDescriptionSection({ application, onChanged, onError }) {
  const [draft, setDraft] = useState(null); // null: not editing
  const [expanded, setExpanded] = useState(false);
  const { busy, run } = useAction(onError);
  const text = application.jd_text ?? "";

  async function fetchFromLink() {
    const result = await run(() => sendJson(`/applications/${application.id}/jd/fetch`, "POST"));
    if (result) setDraft(result.text);
  }

  async function save() {
    const result = await run(() => sendJson(`/applications/${application.id}/jd`, "PUT", { text: draft }));
    if (result) {
      setDraft(null);
      onChanged();
    }
  }

  const fetchButton = application.url && (
    <Button disabled={busy} onClick={fetchFromLink} title="Reads the posting page and fills the box for you to check">
      <Download className="size-3.5" aria-hidden /> {busy ? "Fetching…" : "Fetch from link"}
    </Button>
  );

  return (
    <section>
      <SectionTitle>Job description</SectionTitle>
      {draft !== null ? (
        <div className="space-y-2">
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={12}
            placeholder="Paste the whole job description from the posting."
            aria-label="Job description"
            autoFocus
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" disabled={busy} onClick={save}>
              Save
            </Button>
            {fetchButton}
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : text ? (
        <Card className="p-3.5 text-sm">
          <p className="whitespace-pre-wrap text-ink-soft">
            {expanded || text.length <= PREVIEW_CHARS ? text : `${text.slice(0, PREVIEW_CHARS).trimEnd()}…`}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {text.length > PREVIEW_CHARS && (
              <Button variant="ghost" onClick={() => setExpanded((value) => !value)}>
                {expanded ? "Show less" : "Show all"}
              </Button>
            )}
            <Button onClick={() => setDraft(text)}>
              <Pencil className="size-3.5" aria-hidden /> Edit
            </Button>
            {application.jd_saved_at && <span className="ml-auto text-xs text-muted">Saved {formatDateTime(application.jd_saved_at)}</span>}
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          <Empty>Save the job description so you still have it if the posting comes down. The prep guide is built from it.</Empty>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => setDraft("")}>
              Paste description
            </Button>
            {fetchButton}
          </div>
        </div>
      )}
    </section>
  );
}
