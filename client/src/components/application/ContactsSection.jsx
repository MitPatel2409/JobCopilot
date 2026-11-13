import { useState } from "react";
import { Linkedin, Mail, Pencil, Plus, Trash2 } from "lucide-react";
import { sendJson } from "../../api/client";
import { useAction } from "../../hooks/useAction";
import FormDialog from "../FormDialog";
import { Button, ConfirmDialog, Empty, Field, Input, List, Menu, SectionTitle } from "../ui";
import { LINK } from "./DetailsSection";

/** Recruiters and referrals for one application: add, edit, delete. */
export default function ContactsSection({ application, contacts, onChanged, onError }) {
  const [editing, setEditing] = useState(null); // {} for a new contact, or the contact
  const [deleting, setDeleting] = useState(null);
  const { run } = useAction(onError);

  async function remove() {
    const contact = deleting;
    setDeleting(null);
    if ((await run(() => sendJson(`/contacts/${contact.id}`, "DELETE"))) !== null) onChanged();
  }

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <SectionTitle count={contacts.length}>Recruiters &amp; contacts</SectionTitle>
        <Button variant="ghost" onClick={() => setEditing({})}>
          <Plus className="size-3.5" aria-hidden /> Add
        </Button>
      </div>
      {contacts.length === 0 ? (
        <Empty>No contacts yet. Add the recruiter or referral you reached out to.</Empty>
      ) : (
        <List>
          {contacts.map((contact) => (
            <li key={contact.id} className="flex items-start gap-2 px-3.5 py-2.5 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-ink">
                  {contact.name}
                  {contact.title && <span className="font-normal text-muted"> · {contact.title}</span>}
                </p>
                <p className="mt-1 flex flex-wrap gap-3 text-xs">
                  {contact.linkedin_url && (
                    <a href={contact.linkedin_url} target="_blank" rel="noreferrer" className={LINK}>
                      <Linkedin className="size-3.5" aria-hidden /> LinkedIn
                    </a>
                  )}
                  {contact.email && (
                    <a href={`mailto:${contact.email}`} className={LINK}>
                      <Mail className="size-3.5" aria-hidden /> {contact.email}
                    </a>
                  )}
                </p>
              </div>
              <Menu
                label={`Actions for ${contact.name}`}
                items={[
                  { label: "Edit", icon: Pencil, onSelect: () => setEditing(contact) },
                  { label: "Delete", icon: Trash2, danger: true, onSelect: () => setDeleting(contact) },
                ]}
              />
            </li>
          ))}
        </List>
      )}

      {editing && (
        <ContactDialog
          application={application}
          contact={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onChanged();
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog title={`Delete ${deleting.name}?`} confirmLabel="Delete" onConfirm={remove} onClose={() => setDeleting(null)}>
          Messages written to them are kept.
        </ConfirmDialog>
      )}
    </section>
  );
}

function ContactDialog({ application, contact, onClose, onSaved }) {
  const isNew = !contact.id;
  const [form, setForm] = useState({
    name: contact.name ?? "",
    title: contact.title ?? "",
    email: contact.email ?? "",
    linkedin_url: contact.linkedin_url ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const set = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));

  async function save() {
    setSaving(true);
    setError(null);
    try {
      if (isNew) await sendJson(`/applications/${application.id}/contacts`, "POST", form);
      else await sendJson(`/contacts/${contact.id}`, "PATCH", form);
      onSaved();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormDialog
      title={isNew ? `New contact at ${application.company}` : `Edit ${contact.name}`}
      submitLabel={isNew ? "Add contact" : "Save"}
      saving={saving}
      error={error}
      canSubmit={Boolean(form.name.trim())}
      onSubmit={save}
      onClose={onClose}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name">
          <Input value={form.name} onChange={set("name")} autoFocus required />
        </Field>
        <Field label="Title" hint="Optional">
          <Input value={form.title} onChange={set("title")} placeholder="e.g. Campus Recruiter" />
        </Field>
      </div>
      <Field label="Email" hint="Optional">
        <Input type="email" value={form.email} onChange={set("email")} placeholder="name@company.com" />
      </Field>
      <Field label="LinkedIn" hint="Optional">
        <Input value={form.linkedin_url} onChange={set("linkedin_url")} placeholder="linkedin.com/in/…" />
      </Field>
    </FormDialog>
  );
}
