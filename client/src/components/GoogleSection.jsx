import { useState } from "react";
import { AlertTriangle, CalendarDays, Check, Copy, ExternalLink, Inbox, Mail, MailSearch } from "lucide-react";
import { apiUrl, sendJson } from "../api/client";
import { useAction } from "../hooks/useAction";
import { useFetch } from "../hooks/useFetch";
import { Button, Card, Field, Input, LoadState, SectionTitle } from "./ui";

const CONNECTOR_INFO = {
  calendar: { icon: CalendarDays, text: "Every reminder becomes a 30-minute event with the job link and recruiter details." },
  gmail_send: { icon: Mail, text: "A morning email to you with what's due. Sent from your own Gmail, only to you." },
  gmail_drafts: { icon: Inbox, text: "Put outreach drafts in your Gmail Drafts folder, addressed and ready. You press Send." },
  gmail_read: { icon: MailSearch, text: "Every 15 minutes, look for mail from recruiters you saved and suggest a status. Only the sender, subject and preview are kept." },
};

const CONSOLE = {
  project: "https://console.cloud.google.com/projectcreate",
  apis: "https://console.cloud.google.com/flows/enableapi?apiid=gmail.googleapis.com,calendar-json.googleapis.com",
  consent: "https://console.cloud.google.com/auth/overview",
  testUsers: "https://console.cloud.google.com/auth/audience",
  client: "https://console.cloud.google.com/auth/clients/create",
};

/**
 * Google Calendar and Gmail. Without an OAuth client: a short guided setup
 * that ends with pasting the Client ID and secret here. With one: tick the
 * services and connect them all on one Google consent screen.
 */
export default function GoogleSection({ refreshKey, onError, onChanged }) {
  const setup = useFetch("/google/setup", refreshKey);
  const connectors = useFetch("/connectors", refreshKey);

  return (
    <section>
      <SectionTitle>Google Calendar and Gmail</SectionTitle>
      {!setup.data || !connectors.data ? (
        <LoadState loading={setup.loading || connectors.loading} error={setup.error ?? connectors.error} />
      ) : setup.data.configured ? (
        <Connect setup={setup.data} data={connectors.data} onError={onError} onChanged={onChanged} />
      ) : (
        <SetupGuide setup={setup.data} onError={onError} onChanged={onChanged} />
      )}
    </section>
  );
}

function SetupGuide({ setup, onError, onChanged }) {
  const [form, setForm] = useState({ client_id: "", client_secret: "" });
  const { busy, run } = useAction(onError);
  const set = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value.trim() }));

  async function save(event) {
    event.preventDefault();
    if (await run(() => sendJson("/google/setup", "PUT", form))) onChanged();
  }

  return (
    <Card className="space-y-4 p-4">
      <p className="text-sm text-ink-soft">
        Optional. Job-Copilot works without Google; this adds calendar events, the morning digest, Gmail drafts and noticing recruiter replies.
        It takes about five minutes, once, and is free. Google needs you to register a small &ldquo;app&rdquo; of your own; nobody else sees it.
      </p>
      <ol className="space-y-3 text-sm">
        <Step number={1} title="Create a Google Cloud project" link={CONSOLE.project} linkLabel="Create project">
          Any name, e.g. <span className="font-medium text-ink">job-copilot</span>. No billing needed.
        </Step>
        <Step number={2} title="Turn on Gmail and Calendar" link={CONSOLE.apis} linkLabel="Enable both APIs">
          Pick your new project, then click <span className="font-medium text-ink">Enable</span>.
        </Step>
        <Step number={3} title="Describe the app and add yourself as a tester" link={CONSOLE.consent} linkLabel="Open Google Auth Platform">
          Click <span className="font-medium text-ink">Get started</span>: app name &ldquo;Job-Copilot&rdquo;, your email, audience{" "}
          <span className="font-medium text-ink">External</span>. Then, under{" "}
          <a href={CONSOLE.testUsers} target="_blank" rel="noreferrer" className="underline underline-offset-2">
            Audience → Test users
          </a>
          , add your own Gmail address.
        </Step>
        <Step number={4} title="Create the OAuth client" link={CONSOLE.client} linkLabel="Create client">
          Type <span className="font-medium text-ink">Web application</span>. Under <span className="font-medium text-ink">Authorized redirect URIs</span>, add:
          <CopyField value={setup.redirectUri} />
          Click <span className="font-medium text-ink">Create</span> and keep the window with the Client ID and secret open.
        </Step>
        <Step number={5} title="Paste them here">
          <form onSubmit={save} className="mt-2 space-y-2">
            <Field label="Client ID">
              <Input value={form.client_id} onChange={set("client_id")} placeholder="1234567890-abc….apps.googleusercontent.com" autoComplete="off" />
            </Field>
            <Field label="Client secret">
              <Input type="password" value={form.client_secret} onChange={set("client_secret")} placeholder="GOCSPX-…" autoComplete="off" />
            </Field>
            <Button type="submit" variant="primary" size="md" disabled={busy || !form.client_id || !form.client_secret}>
              Save
            </Button>
            <p className="text-xs text-muted">Stored on this computer, encrypted. Then you pick what to connect.</p>
          </form>
        </Step>
      </ol>
    </Card>
  );
}

function Step({ number, title, link, linkLabel, children }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-sunken text-xs font-semibold text-ink-soft ring-1 ring-line-strong">
        {number}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 font-medium text-ink">
          {title}
          {link && (
            <a
              href={link}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-line-strong bg-surface px-2 py-0.5 text-xs font-medium text-ink-soft hover:bg-sunken"
            >
              {linkLabel} <ExternalLink className="size-3" aria-hidden />
            </a>
          )}
        </p>
        <div className="mt-0.5 text-muted">{children}</div>
      </div>
    </li>
  );
}

function CopyField({ value }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="my-1.5 flex items-center gap-2 rounded-md border border-line-strong bg-sunken px-2.5 py-1.5 font-mono text-xs text-ink">
      <span className="min-w-0 flex-1 truncate">{value}</span>
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="inline-flex items-center gap-1 font-sans text-xs font-medium text-ink-soft hover:text-ink"
      >
        {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
        {copied ? "Copied" : "Copy"}
      </button>
    </span>
  );
}

function Connect({ setup, data, onError, onChanged }) {
  const [picked, setPicked] = useState(() => new Set(data.connectors.filter((c) => !c.connected).map((c) => c.id)));
  const { busy, run } = useAction(onError);
  const notConnected = data.connectors.filter((c) => !c.connected);
  const chosen = notConnected.filter((c) => picked.has(c.id)).map((c) => c.id);

  function toggle(id) {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function disconnect(id) {
    if ((await run(() => sendJson(`/connectors/${id}`, "DELETE"))) !== null) onChanged();
  }

  async function forgetClient() {
    if ((await run(() => sendJson("/google/setup", "DELETE"))) !== null) onChanged();
  }

  return (
    <div className="space-y-3">
      {data.error && (
        <Card className="flex items-start gap-2 border-danger-line bg-danger-soft p-3.5 text-sm text-danger">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          Google stopped accepting this app&apos;s access (it was removed, or it expired after 7 days while the app is in testing). Connect again below.
        </Card>
      )}
      {data.calendarTimeZone && (
        <Card className="flex items-start gap-2 border-line-strong bg-sunken p-3.5 text-sm text-ink-soft">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
          <span>
            Your Google Calendar is set to <span className="font-medium text-ink">{data.calendarTimeZone.calendar}</span>, but Job-Copilot uses{" "}
            <span className="font-medium text-ink">{data.calendarTimeZone.app}</span>. Events are at the right moment, but Google shows them at a
            different hour (a 9:00 reminder looks like it&apos;s later or earlier). In{" "}
            <a href="https://calendar.google.com/calendar/r/settings" target="_blank" rel="noreferrer" className="underline underline-offset-2">
              Google Calendar settings
            </a>
            , set <span className="font-medium text-ink">General → Time zone</span> and your calendar&apos;s own time zone (under{" "}
            <span className="font-medium text-ink">Settings for my calendars</span>) to {data.calendarTimeZone.app}. Or, if Google is right, change the
            timezone in Profile above.
          </span>
        </Card>
      )}
      <p className="text-sm text-muted">
        {data.account ? `Connected as ${data.account}. Connecting with another Google account replaces it.` : "Not connected yet. Pick what to use and connect."}
      </p>

      <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-surface">
        {data.connectors.map((connector) => {
          const { icon: Icon, text } = CONNECTOR_INFO[connector.id];
          return (
            <li key={connector.id}>
              <label className={`flex items-center gap-3 px-4 py-3 ${connector.connected ? "" : "cursor-pointer hover:bg-sunken"}`}>
                {connector.connected ? (
                  <Check className="size-4 shrink-0 text-good" aria-label="Connected" />
                ) : (
                  <input type="checkbox" checked={picked.has(connector.id)} onChange={() => toggle(connector.id)} className="size-4 shrink-0 accent-current" />
                )}
                <Icon className="size-5 shrink-0 text-faint" aria-hidden />
                <span className="min-w-48 flex-1">
                  <span className="block text-sm font-medium text-ink">
                    {connector.label}
                    {connector.connected && <span className="ml-2 text-xs font-normal text-good">Connected</span>}
                  </span>
                  <span className="block text-sm text-muted">{text}</span>
                </span>
                {connector.connected && (
                  <Button disabled={busy} onClick={() => disconnect(connector.id)}>
                    Disconnect
                  </Button>
                )}
              </label>
            </li>
          );
        })}
      </ul>

      {notConnected.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <a
            href={chosen.length ? apiUrl(`/auth/google/connect?services=${chosen.join(",")}`) : undefined}
            aria-disabled={chosen.length === 0}
            className={`inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg hover:bg-accent-hover ${
              chosen.length ? "" : "pointer-events-none opacity-40"
            }`}
          >
            Connect Google{chosen.length > 1 ? ` (${chosen.length} services)` : ""}
          </a>
          <span className="text-xs text-muted">
            Google asks for everything ticked on one screen. If it says the app isn&apos;t verified, that&apos;s your own app: click Continue.
          </span>
        </div>
      )}

      <p className="text-xs text-muted">
        {setup.source === "env" ? "Using the Google client from server/.env." : `Using the Google client ${setup.clientId}. `}
        {setup.source === "app" && (
          <button type="button" onClick={forgetClient} disabled={busy} className="underline underline-offset-2 hover:text-ink">
            Use a different one
          </button>
        )}
      </p>
    </div>
  );
}
