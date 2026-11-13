import { useState } from "react";
import { Sparkles } from "lucide-react";
import { sendJson } from "../api/client";
import { useFetch } from "../hooks/useFetch";
import { describeApplication } from "../utils/format";
import { Button, Field, LoadState, Modal, Textarea } from "./ui";

/**
 * Asked when an application moves to Interview: make a prep guide from the
 * job description and résumé? Lets the user paste the job description first
 * when none is saved.
 */
export default function PrepOfferDialog({ applicationId, onClose, onCreated }) {
  const { data, loading, error } = useFetch(`/applications/${applicationId}`);
  const [jd, setJd] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);

  async function create() {
    setBusy(true);
    setFailure(null);
    try {
      if (!data.application.jd_text) await sendJson(`/applications/${applicationId}/jd`, "PUT", { text: jd });
      await sendJson(`/applications/${applicationId}/prep-guide`, "POST");
      onCreated(applicationId);
    } catch (createError) {
      setFailure(createError.message);
    } finally {
      setBusy(false);
    }
  }

  const needsJd = data && !data.application.jd_text;
  const hasResume = data && Boolean(data.resume || data.baseResume);

  return (
    <Modal
      title="Interview! Make a prep guide?"
      onClose={onClose}
      footer={
        <>
          <Button size="md" onClick={onClose}>
            Not now
          </Button>
          <Button size="md" variant="primary" disabled={!data || busy || (needsJd && jd.trim().length < 50)} onClick={create}>
            <Sparkles className="size-4" aria-hidden /> {busy ? "Making the guide…" : "Make prep guide"}
          </Button>
        </>
      }
    >
      <div className="space-y-3 px-4 py-4 text-sm text-ink-soft">
        {!data ? (
          <LoadState loading={loading} error={error} />
        ) : (
          <>
            <p>
              For <span className="font-medium text-ink">{describeApplication(data.application)}</span>: a list of topics to study, built from
              the job description{hasResume ? " and your résumé" : ""}. You choose which ones go into your study plan.
            </p>
            {!hasResume && <p className="text-muted">Tip: upload the résumé you sent (on the application, or a base one in Settings) so the guide can focus on gaps.</p>}
            {needsJd && (
              <Field label="Job description" hint="Not saved yet">
                <Textarea value={jd} onChange={(event) => setJd(event.target.value)} rows={8} placeholder="Paste the job description from the posting." autoFocus />
              </Field>
            )}
            {failure && (
              <p role="alert" className="rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-danger">
                {failure}
              </p>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
