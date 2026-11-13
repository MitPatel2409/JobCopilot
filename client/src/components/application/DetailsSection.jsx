import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { hostname } from "../../utils/format";
import { STATUSES } from "../../utils/status";
import { Button, Card, Field, Input, Select, Textarea } from "../ui";

export const LINK = "inline-flex items-center gap-1 text-ink-soft underline-offset-2 hover:text-ink hover:underline";

/** Company, role, dates, link and notes. Changing the status goes through `onStatus` (it asks for a note). */
export default function DetailsSection({ application, onSave, onStatus }) {
  const saved = {
    company: application.company,
    role: application.role,
    applied_on: application.applied_on,
    interview_on: application.interview_on ?? "",
    url: application.url ?? "",
    notes: application.notes,
  };
  const [form, setForm] = useState(saved);
  const set = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
  const changed = Object.fromEntries(Object.entries(form).filter(([field, value]) => value !== saved[field]));
  const dirty = Object.keys(changed).length > 0;

  return (
    <Card className="space-y-3 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Company">
          <Input value={form.company} onChange={set("company")} />
        </Field>
        <Field label="Role">
          <Input value={form.role} onChange={set("role")} placeholder="e.g. Software Developer Intern" />
        </Field>
        <Field label="Status">
          <Select value={application.status} onChange={(event) => onStatus(event.target.value)}>
            {STATUSES.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Applied on">
          <Input type="date" value={form.applied_on} onChange={set("applied_on")} />
        </Field>
        {(application.status === "interview" || application.interview_on) && (
          <Field label="Interview on" hint="Optional">
            <Input type="date" value={form.interview_on} onChange={set("interview_on")} />
          </Field>
        )}
      </div>

      <Field
        label="Job posting"
        hint={
          application.url && (
            <a href={application.url} target="_blank" rel="noreferrer" className={LINK}>
              Open {hostname(application.url)} <ExternalLink className="size-3" aria-hidden />
            </a>
          )
        }
      >
        <Input value={form.url} onChange={set("url")} placeholder="https://…" />
      </Field>

      <Field label="Notes">
        <Textarea value={form.notes} onChange={set("notes")} rows={3} />
      </Field>

      {dirty && (
        <div className="flex gap-2">
          <Button variant="primary" disabled={!form.company.trim() || !form.applied_on} onClick={() => onSave(changed)}>
            Save changes
          </Button>
          <Button variant="ghost" onClick={() => setForm(saved)}>
            Discard
          </Button>
        </div>
      )}
    </Card>
  );
}
