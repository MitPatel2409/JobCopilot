import { useState } from "react";
import { sendJson } from "../api/client";
import { useAction } from "../hooks/useAction";
import { formatDateTime } from "../utils/format";
import { useFetch } from "../hooks/useFetch";
import { ResumeFile } from "./application/ResumeSection";
import GoogleSection from "./GoogleSection";
import { Button, Card, Field, Input, LoadState, SectionTitle, Select, Textarea } from "./ui";

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

function hourLabel(hour) {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric" }).format(new Date(2026, 0, 1, hour));
}

export default function SettingsTab({ refreshKey, onError, onChanged, onNotice }) {
  const profile = useFetch("/profile", refreshKey);

  if (!profile.data) return <LoadState loading={profile.loading} error={profile.error} />;

  return (
    <div className="space-y-8">
      <ProfileSection key={JSON.stringify(profile.data.settings)} data={profile.data} onError={onError} onChanged={onChanged} onNotice={onNotice} />

      <section>
        <SectionTitle>Base résumé</SectionTitle>
        <p className="mb-2 text-sm text-muted">Used for prep guides when an application has no tailored résumé of its own.</p>
        <ResumeFile resume={profile.data.resume} path="/profile/resume" empty="No base résumé yet." onChanged={onChanged} onError={onError} />
      </section>

      <ResumeFolderSection
        key={JSON.stringify([profile.data.settings.resume_folder, profile.data.settings.resume_auto_attach])}
        data={profile.data}
        refreshKey={refreshKey}
        onError={onError}
        onChanged={onChanged}
        onNotice={onNotice}
      />

      <GoogleSection refreshKey={refreshKey} onError={onError} onChanged={onChanged} />

    </div>
  );
}

/** The folder where the tailored résumés are saved; new files in it are offered on the Today page. */
function ResumeFolderSection({ data, refreshKey, onError, onChanged, onNotice }) {
  const { settings, defaults } = data;
  const status = useFetch("/resume-inbox", refreshKey);
  const [folder, setFolder] = useState(settings.resume_folder ?? "");
  const [auto, setAuto] = useState(settings.resume_auto_attach);
  const { busy, run } = useAction(onError);
  const dirty = folder.trim() !== (settings.resume_folder ?? "") || auto !== settings.resume_auto_attach;
  const last = status.data?.last_scan;

  async function save(event) {
    event.preventDefault();
    const body = { resume_folder: folder.trim() || null, resume_auto_attach: auto };
    if (await run(() => sendJson("/profile", "PATCH", body))) {
      onNotice("Résumé folder saved");
      onChanged();
    }
  }

  async function checkNow() {
    const result = await run(() => sendJson("/resume-inbox/scan", "POST"));
    if (!result) return;
    onChanged();
    if (result.result.error) onError(result.result.error);
    else onNotice("Folder checked", result.files.length === 0 ? "Nothing new is waiting." : `${result.files.length} waiting on the Today page.`);
  }

  return (
    <section>
      <SectionTitle>Résumé folder</SectionTitle>
      <form onSubmit={save}>
        <Card className="space-y-3 p-4">
          <p className="text-sm text-muted">
            Where you save your tailored résumés (PDF or Word). New files are noticed within a minute and offered for the application they match. One sub-folder per company works. Files already there are not offered. Your files are only read, never changed.
          </p>
          <Field label="Folder" hint="The full path, e.g. C:\Users\you\Documents\Resumes">
            <Input value={folder} onChange={(event) => setFolder(event.target.value)} placeholder={defaults.resume_folder || "Not set"} maxLength={500} />
          </Field>
          <label className="flex items-start gap-2 text-sm text-ink-soft">
            <input type="checkbox" checked={auto} onChange={(event) => setAuto(event.target.checked)} className="mt-0.5 size-4 accent-current" />
            <span>
              Attach automatically when sure
              <span className="block text-xs text-muted">
                Only when the file name clearly names one application that has no résumé yet. You get an Undo. Otherwise the file waits for your click.
              </span>
            </span>
          </label>
          {last && (
            <p className={`text-xs ${last.error ? "text-danger" : "text-muted"}`}>
              {last.error ?? `Last checked ${formatDateTime(last.at)} · ${last.found} ${last.found === 1 ? "file" : "files"} in the folder`}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="primary" size="md" disabled={busy || !dirty}>
              Save folder
            </Button>
            <Button type="button" size="md" disabled={busy || dirty || !(settings.resume_folder || defaults.resume_folder)} onClick={checkNow}>
              Check now
            </Button>
          </div>
        </Card>
      </form>
    </section>
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
