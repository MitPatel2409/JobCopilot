import { useState } from "react";
import { AlertTriangle, CalendarDays, Inbox, Mail, MailSearch } from "lucide-react";
import { apiUrl, sendJson } from "../api/client";
import { useAction } from "../hooks/useAction";
import { useFetch } from "../hooks/useFetch";
import { ResumeFile } from "./application/ResumeSection";
import { Button, Card, Field, Input, LoadState, SectionTitle, Select, Textarea } from "./ui";

const CONNECTOR_INFO = {
  calendar: { icon: CalendarDays, text: "Every reminder becomes a 30-minute event with the job link and recruiter details." },
  gmail_send: { icon: Mail, text: "A morning email to you with what's due. Sent from your own Gmail, only to you." },
  gmail_drafts: { icon: Inbox, text: "Put outreach drafts in your Gmail Drafts folder, addressed and ready. You press Send." },
  gmail_read: { icon: MailSearch, text: "Every 15 minutes, look for mail from recruiters you saved and suggest a status. Only the sender, subject and preview are kept." },
};

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

function hourLabel(hour) {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric" }).format(new Date(2026, 0, 1, hour));
}

export default function SettingsTab({ refreshKey, onError, onChanged, onNotice }) {
  const profile = useFetch("/profile", refreshKey);
  const connectors = useFetch("/connectors", refreshKey);

  if (!profile.data) return <LoadState loading={profile.loading} error={profile.error} />;

  return (
    <div className="space-y-8">
      <ProfileSection key={JSON.stringify(profile.data.settings)} data={profile.data} onError={onError} onChanged={onChanged} onNotice={onNotice} />

      <section>
        <SectionTitle>Base résumé</SectionTitle>
        <p className="mb-2 text-sm text-muted">Used for prep guides when an application has no tailored résumé of its own.</p>
        <ResumeFile resume={profile.data.resume} path="/profile/resume" empty="No base résumé yet." onChanged={onChanged} onError={onError} />
      </section>

      <ConnectorsSection data={connectors.data} loading={connectors.loading} error={connectors.error} onError={onError} onChanged={onChanged} />

    </div>
  );
}

function ProfileSection({ data, onError, onChanged, onNotice }) {
  const { settings, defaults } = data;
  const [form, setForm] = useState({
    name: settings.name ?? "",
    pitch: settings.pitch ?? "",
    timezone: settings.timezone ?? "",
    reminder_hour: settings.reminder_hour ?? "",
    digest_hour: settings.digest_hour ?? "",
    nudge_hour: settings.nudge_hour ?? "",
    follow_up_days: settings.follow_up_days ?? "",
    digest_enabled: settings.digest_enabled,
  });
  const { busy, run } = useAction(onError);
  const set = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.type === "checkbox" ? event.target.checked : event.target.value }));
  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const zone = form.timezone.trim() || defaults.timezone;

  async function save(event) {
    event.preventDefault();
    const body = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value === "" ? null : value]));
    if (await run(() => sendJson("/profile", "PATCH", body))) {
      onNotice("Settings saved");
      onChanged();
    }
  }

  const hourSelect = (field, label) => (
    <Field label={label}>
      <Select value={form[field]} onChange={set(field)}>
        <option value="">Default ({hourLabel(defaults[field])})</option>
        {HOURS.map((hour) => (
          <option key={hour} value={hour}>
            {hourLabel(hour)}
          </option>
        ))}
      </Select>
    </Field>
  );

  return (
    <section>
      <SectionTitle>Profile</SectionTitle>
      <form onSubmit={save}>
        <Card className="space-y-4 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Your name" hint="Signs outreach drafts">
              <Input value={form.name} onChange={set("name")} placeholder={defaults.name || "Your first name"} maxLength={100} />
            </Field>
            <Field label="Timezone" hint={zone === browserZone ? null : `This browser is on ${browserZone}; the app uses ${zone}`}>
              <Input value={form.timezone} onChange={set("timezone")} placeholder={defaults.timezone} list="timezones" />
              <datalist id="timezones">
                {(Intl.supportedValuesOf?.("timeZone") ?? []).map((zone) => (
                  <option key={zone} value={zone} />
                ))}
              </datalist>
            </Field>
          </div>
          <Field label="About you" hint="One or two sentences, so drafts are specific">
            <Textarea
              value={form.pitch}
              onChange={set("pitch")}
              rows={2}
              maxLength={600}
              placeholder={defaults.pitch || "e.g. Final-year CS student who built a Flask + React app used by 200 people."}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-4">
            {hourSelect("reminder_hour", "Reminders at")}
            {hourSelect("digest_hour", "Digest at")}
            {hourSelect("nudge_hour", "Evening check-in")}
            <Field label="Follow up after">
              <Select value={form.follow_up_days} onChange={set("follow_up_days")}>
                <option value="">Default ({defaults.follow_up_days} days)</option>
                {[3, 5, 7, 10, 14, 21].map((days) => (
                  <option key={days} value={days}>
                    {days} days
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-ink-soft">
            <input type="checkbox" checked={form.digest_enabled} onChange={set("digest_enabled")} className="size-4 accent-current" />
            Send me the morning digest (needs &ldquo;Daily digest from your Gmail&rdquo; below)
          </label>
          <Button type="submit" variant="primary" size="md" disabled={busy}>
            Save settings
          </Button>
        </Card>
      </form>
    </section>
  );
}

function ConnectorsSection({ data, loading, error, onError, onChanged }) {
  const { busy, run } = useAction(onError);
  if (!data) return <LoadState loading={loading} error={error} />;

  async function disconnect(id) {
    if ((await run(() => sendJson(`/connectors/${id}`, "DELETE"))) !== null) onChanged();
  }

  return (
    <section>
      <SectionTitle>Google connections</SectionTitle>
      {!data.available && (
        <Card className="mb-3 p-3.5 text-sm text-ink-soft">
          Google isn&apos;t set up on this server yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to server/.env (see the README) and
          restart the server.
        </Card>
      )}
      {data.account && <p className="mb-2 text-sm text-muted">Connected as {data.account}. Connecting with another Google account replaces it.</p>}
      {data.error && (
        <Card className="mb-3 flex items-start gap-2 border-danger-line bg-danger-soft p-3.5 text-sm text-danger">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          Google stopped accepting this app&apos;s access (it was removed, or it expired after 7 days while the app is in testing). Connect again below.
        </Card>
      )}
      <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-surface">
        {data.connectors.map((connector) => {
          const { icon: Icon, text } = CONNECTOR_INFO[connector.id];
          return (
            <li key={connector.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <Icon className="size-5 shrink-0 text-faint" aria-hidden />
              <div className="min-w-48 flex-1">
                <p className="text-sm font-medium text-ink">
                  {connector.label}
                  {connector.connected && <span className="ml-2 text-xs font-normal text-good">Connected</span>}
                </p>
                <p className="text-sm text-muted">{text}</p>
              </div>
              {connector.connected ? (
                <Button disabled={busy} onClick={() => disconnect(connector.id)}>
                  Disconnect
                </Button>
              ) : (
                <a
                  href={data.available ? apiUrl(`/auth/google/connect/${connector.id}`) : undefined}
                  aria-disabled={!data.available}
                  className={`inline-flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-accent-fg hover:bg-accent-hover ${
                    data.available ? "" : "pointer-events-none opacity-40"
                  }`}
                >
                  Connect
                </a>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-muted">Connecting opens Google to ask for that one permission. The app never sends mail to anyone but you.</p>
    </section>
  );
}
