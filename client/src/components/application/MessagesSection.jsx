import { useState } from "react";
import { Check, Copy, Inbox, Linkedin, Mail, Pencil, Plus, Trash2 } from "lucide-react";
import { sendJson } from "../../api/client";
import { useAction } from "../../hooks/useAction";
import { formatDate, localDatePlus } from "../../utils/format";
import FormDialog from "../FormDialog";
import { Button, Card, ConfirmDialog, Empty, Field, Input, Menu, SectionTitle, Select, Textarea } from "../ui";

function gmailComposeUrl({ to, subject, body }) {
  const params = new URLSearchParams({ view: "cm", fs: "1", to: to ?? "", su: subject ?? "", body: body ?? "" });
  return `https://mail.google.com/mail/?${params}`;
}

const LINK_BUTTON =
  "inline-flex items-center gap-1.5 rounded-md border border-line-strong bg-surface px-2.5 py-1 text-xs font-medium text-ink-soft hover:bg-sunken";

/**
 * Outreach messages for one application. Nothing is ever sent from here:
 * copy, open in Gmail, or save into Gmail Drafts, then mark it sent yourself.
 */
export default function MessagesSection({ application, items, contacts, canSaveToGmail, onChanged, onError }) {
  const [copiedId, setCopiedId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const { busy, run } = useAction(onError);

  async function copy(item) {
    await navigator.clipboard.writeText(item.subject ? `Subject: ${item.subject}\n\n${item.body}` : item.body);
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  async function act(fn) {
    if ((await run(fn)) !== null) onChanged();
  }

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <SectionTitle count={items.length}>Messages</SectionTitle>
        <Button variant="ghost" onClick={() => setEditing({})}>
          <Plus className="size-3.5" aria-hidden /> Write
        </Button>
      </div>
      {items.length === 0 ? (
        <Empty>No messages. Write one here, or ask the assistant to draft one once you&apos;ve saved a recruiter.</Empty>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id}>
              <Card className="p-3.5 text-sm">
                <div className="mb-1.5 flex items-start gap-2">
                  <p className="flex flex-1 flex-wrap items-center gap-2 text-xs text-muted">
                    <span className={`font-medium ${item.status === "sent" ? "text-good" : "text-ink-soft"}`}>
                      {item.status === "sent" ? `Sent ${item.sent_on ? formatDate(item.sent_on) : ""}` : "Draft"}
                    </span>
                    <span aria-hidden>·</span>
                    {item.channel === "linkedin" ? "LinkedIn" : "Email"}
                    {item.contact_name && ` to ${item.contact_name}`}
                    {item.gmail_draft_id && (
                      <>
                        <span aria-hidden>·</span>
                        <span className="inline-flex items-center gap-1">
                          <Inbox className="size-3" aria-hidden /> in Gmail Drafts
                        </span>
                      </>
                    )}
                  </p>
                  <Menu
                    label="Message actions"
                    items={[
                      { label: "Edit", icon: Pencil, onSelect: () => setEditing(item) },
                      { label: "Delete", icon: Trash2, danger: true, onSelect: () => setDeleting(item) },
                    ]}
                  />
                </div>
                {item.subject && <p className="font-medium text-ink">{item.subject}</p>}
                <p className="mt-1 whitespace-pre-wrap text-ink-soft">{item.body}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Button onClick={() => copy(item)}>
                    {copiedId === item.id ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
                    {copiedId === item.id ? "Copied" : "Copy"}
                  </Button>
                  {item.channel === "email" && canSaveToGmail && item.status === "draft" && (
                    <Button disabled={busy} onClick={() => act(() => sendJson(`/outreach/${item.id}/gmail-draft`, "POST"))}>
                      <Inbox className="size-3.5" aria-hidden /> {item.gmail_draft_id ? "Save to Gmail again" : "Save to Gmail Drafts"}
                    </Button>
                  )}
                  {item.channel === "email" && (
                    <a href={gmailComposeUrl({ to: item.contact_email, subject: item.subject, body: item.body })} target="_blank" rel="noreferrer" className={LINK_BUTTON}>
                      <Mail className="size-3.5" aria-hidden /> Open in Gmail
                    </a>
                  )}
                  {item.channel === "linkedin" && item.contact_linkedin && (
                    <a href={item.contact_linkedin} target="_blank" rel="noreferrer" className={LINK_BUTTON}>
                      <Linkedin className="size-3.5" aria-hidden /> Open profile
                    </a>
                  )}
                  {item.status === "draft" && (
                    <Button disabled={busy} onClick={() => act(() => sendJson(`/outreach/${item.id}`, "PATCH", { status: "sent" }))}>
                      Mark as sent
                    </Button>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <MessageDialog
          application={application}
          message={editing}
          contacts={contacts}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onChanged();
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="Delete this message?"
          confirmLabel="Delete"
          onConfirm={() => {
            const item = deleting;
            setDeleting(null);
            act(() => sendJson(`/outreach/${item.id}`, "DELETE"));
          }}
          onClose={() => setDeleting(null)}
        >
          {deleting.gmail_draft_id ? "The copy in your Gmail Drafts stays there." : "This can't be undone."}
        </ConfirmDialog>
      )}
    </section>
  );
}

function MessageDialog({ application, message, contacts, onClose, onSaved }) {
  const isNew = !message.id;
  const [form, setForm] = useState({
    contact_id: message.contact_id ?? contacts[0]?.id ?? "",
    channel: message.channel ?? "email",
    subject: message.subject ?? "",
    body: message.body ?? "",
    status: message.status ?? "draft",
    sent_on: message.sent_on ?? localDatePlus(0),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const set = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));

  async function save() {
    setSaving(true);
    setError(null);
    const body = {
      ...form,
      contact_id: form.contact_id ? Number(form.contact_id) : null,
      subject: form.channel === "email" ? form.subject : "",
      sent_on: form.status === "sent" ? form.sent_on : undefined,
    };
    try {
      if (isNew) await sendJson(`/applications/${application.id}/outreach`, "POST", { ...body, contact_id: body.contact_id ?? undefined });
      else await sendJson(`/outreach/${message.id}`, "PATCH", body);
      onSaved();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormDialog
      title={isNew ? `New message about ${application.company}` : "Edit message"}
      submitLabel={isNew ? "Save message" : "Save"}
      saving={saving}
      error={error}
      canSubmit={Boolean(form.body.trim())}
      onSubmit={save}
      onClose={onClose}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="To">
          <Select value={form.contact_id} onChange={set("contact_id")}>
            <option value="">No one saved</option>
            {contacts.map((contact) => (
              <option key={contact.id} value={contact.id}>
                {contact.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Channel">
          <Select value={form.channel} onChange={set("channel")}>
            <option value="email">Email</option>
            <option value="linkedin">LinkedIn</option>
          </Select>
        </Field>
      </div>
      {form.channel === "email" && (
        <Field label="Subject">
          <Input value={form.subject} onChange={set("subject")} maxLength={300} />
        </Field>
      )}
      <Field label="Message">
        <Textarea value={form.body} onChange={set("body")} rows={8} autoFocus required />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Status">
          <Select value={form.status} onChange={set("status")}>
            <option value="draft">Draft, not sent yet</option>
            <option value="sent">Already sent</option>
          </Select>
        </Field>
        {form.status === "sent" && (
          <Field label="Sent on">
            <Input type="date" value={form.sent_on} max={localDatePlus(0)} onChange={set("sent_on")} />
          </Field>
        )}
      </div>
    </FormDialog>
  );
}
