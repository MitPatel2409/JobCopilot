import { useState } from "react";
import { Pencil } from "lucide-react";
import { sendJson } from "../api/client";
import { useAction } from "../hooks/useAction";
import { useFetch } from "../hooks/useFetch";
import { formatDate, localDatePlus } from "../utils/format";
import { Button, Empty, IconButton, Input, LoadState, Textarea } from "./ui";

export default function JournalTab({ refreshKey, onError, onChanged }) {
  const { data, loading, error } = useFetch("/journal", refreshKey);
  const [line, setLine] = useState("");
  const [editing, setEditing] = useState(null); // { date, text }
  const { busy, run } = useAction(onError);

  async function addLine(event) {
    event.preventDefault();
    if (!line.trim()) return;
    if (await run(() => sendJson("/journal", "POST", { line, date: localDatePlus(0) }))) {
      setLine("");
      onChanged();
    }
  }

  async function saveDay() {
    if ((await run(() => sendJson(`/journal/${editing.date}`, "PUT", { summary: editing.text }))) !== null) {
      setEditing(null);
      onChanged();
    }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={addLine} className="flex gap-2">
        <Input
          id="journal-input"
          value={line}
          onChange={(event) => setLine(event.target.value)}
          maxLength={500}
          placeholder="Add to today: e.g. Mock interview with Sam, 45 min"
          aria-label="Add a line to today's journal"
        />
        <Button type="submit" variant="primary" size="md" disabled={busy || !line.trim()}>
          Add
        </Button>
      </form>

      {!data ? (
        <LoadState loading={loading} error={error} />
      ) : data.entries.length === 0 ? (
        <Empty>Your daily log fills in as you add lines here or tell the assistant what you did.</Empty>
      ) : (
        <ol className="divide-y divide-line rounded-md border border-line bg-surface">
          {data.entries.map((entry) => (
            <li key={entry.date} className="grid gap-x-6 gap-y-1 px-4 py-3 sm:grid-cols-[8rem_1fr_auto]">
              <p className="text-sm font-medium text-ink">{formatDate(entry.date)}</p>
              {editing?.date === entry.date ? (
                <div className="space-y-2 sm:col-span-2">
                  <Textarea
                    value={editing.text}
                    onChange={(event) => setEditing({ ...editing, text: event.target.value })}
                    rows={Math.max(3, editing.text.split("\n").length + 1)}
                    aria-label={`Journal for ${formatDate(entry.date)}, one line per item`}
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <Button variant="primary" disabled={busy} onClick={saveDay}>
                      Save
                    </Button>
                    <Button variant="ghost" onClick={() => setEditing(null)}>
                      Cancel
                    </Button>
                    <span className="self-center text-xs text-muted">One item per line. Clear it all to delete the day.</span>
                  </div>
                </div>
              ) : (
                <>
                  <ul className="list-disc space-y-0.5 pl-4 text-sm text-ink-soft marker:text-faint">
                    {entry.summary.split("\n").map((item, index) => (
                      <li key={index}>{item}</li>
                    ))}
                  </ul>
                  <IconButton label={`Edit ${formatDate(entry.date)}`} onClick={() => setEditing({ date: entry.date, text: entry.summary })} className="size-7 justify-self-end">
                    <Pencil className="size-3.5" aria-hidden />
                  </IconButton>
                </>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
