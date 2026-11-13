import { useEffect, useReducer, useState } from "react";
import { Bell, BookOpen, Keyboard, Moon, NotebookPen, PanelRight, Plus, Sun } from "lucide-react";
import Sidebar from "./components/Sidebar";
import MobileNav from "./components/MobileNav";
import PageHeader from "./components/PageHeader";
import ChatPanel from "./components/ChatPanel";
import TodayTab from "./components/TodayTab";
import ApplicationsTab from "./components/ApplicationsTab";
import StudyTab from "./components/StudyTab";
import JournalTab from "./components/JournalTab";
import InsightsTab from "./components/InsightsTab";
import SettingsTab from "./components/SettingsTab";
import ApplicationDrawer from "./components/ApplicationDrawer";
import NewApplicationDialog from "./components/NewApplicationDialog";
import NewReminderDialog from "./components/NewReminderDialog";
import NewTopicDialog from "./components/NewTopicDialog";
import PrepOfferDialog from "./components/PrepOfferDialog";
import CommandMenu from "./components/CommandMenu";
import ShortcutsDialog from "./components/ShortcutsDialog";
import Toasts from "./components/Toasts";
import { Button } from "./components/ui";
import { getJson } from "./api/client";
import { useChat } from "./hooks/useChat";
import { useFetch } from "./hooks/useFetch";
import { useServerEvents } from "./hooks/useServerEvents";
import { useShortcuts } from "./hooks/useShortcuts";
import { useStoredState } from "./hooks/useStoredState";
import { useTheme } from "./hooks/useTheme";
import { useToasts } from "./hooks/useToasts";
import { describeApplication, formatLongDate, setAppTimeZone } from "./utils/format";
import { showNotification } from "./utils/notify";
import { VIEWS } from "./utils/views";

const COMPONENTS = {
  today: TodayTab,
  applications: ApplicationsTab,
  study: StudyTab,
  journal: JournalTab,
  insights: InsightsTab,
  settings: SettingsTab,
};

// The main button of each view: its label and the dialog it opens.
const ACTIONS = {
  today: { label: "New reminder", dialog: "reminder" },
  applications: { label: "New application", dialog: "application" },
  study: { label: "Log study", dialog: "topic" },
};

const CONNECT_ERRORS = {
  denied: "Google did not grant the permission.",
  not_configured: "Google isn't set up on this server yet (see the README).",
  expired: "That took too long. Try connecting again.",
};

/** What Google sent back in the address after connecting a service; removed from the address once read. */
function readReturnParams() {
  const params = new URLSearchParams(window.location.search);
  const result = {
    connected: params.get("connected"),
    connectError: params.get("connect_error"),
  };
  if ([...params.keys()].length > 0) window.history.replaceState(null, "", window.location.pathname);
  return result;
}

export default function App() {
  const theme = useTheme();
  const [returned] = useState(readReturnParams);
  return <Workspace theme={theme} returned={returned} />;
}

function Workspace({ theme, returned }) {
  const [storedView, setView] = useStoredState("jc-view", "today");
  const [chatOpen, setChatOpen] = useStoredState("jc-chat-open", () => window.matchMedia("(min-width: 1024px)").matches);
  // Which dialog is open: "application", "reminder", "topic", "commands", "shortcuts" or null.
  const [dialog, setDialog] = useState(null);
  const [applicationId, setApplicationId] = useState(null);
  const [prepOfferId, setPrepOfferId] = useState(null);
  // Bumped whenever data may have changed, so every open panel reloads.
  const [refreshKey, refresh] = useReducer((n) => n + 1, 0);
  const { toasts, push, dismiss } = useToasts();
  const chat = useChat({ onFinished: refresh });
  const today = useFetch("/today", refreshKey);
  const profile = useFetch("/profile", refreshKey);
  // Dates in forms and on screen use the timezone the server uses (Settings).
  if (profile.data) setAppTimeZone(profile.data.settings.timezone || profile.data.defaults.timezone);

  const view = VIEWS.find((item) => item.id === storedView) ?? VIEWS[0];
  const Active = COMPONENTS[view.id];
  const action = ACTIONS[view.id];
  const closeDialog = () => setDialog(null);
  const onError = (message) => push({ kind: "error", title: "Something went wrong", body: message });
  const onNotice = (title, body) => push({ kind: "success", title, body });

  // Coming back from Google after connecting a service.
  useEffect(() => {
    if (returned.connected) {
      setView("settings");
      push({ kind: "success", title: "Connected", body: "Google granted the permission." });
    } else if (returned.connectError) {
      setView("settings");
      push({ kind: "error", title: "Could not connect", body: CONNECT_ERRORS[returned.connectError] ?? "Try again." });
    }
  }, [returned, setView, push]);

  useServerEvents((event) => {
    if (event.type === "reminder_due") {
      const { reminder } = event;
      const body = reminder.url ? `${reminder.message}\n${reminder.url}` : reminder.message;
      showNotification("Job-Copilot reminder", body);
      push({ kind: "reminder", title: "Reminder due", body: reminder.message });
      refresh();
    } else if (event.type === "nudge") {
      showNotification("Job-Copilot", event.message);
      push({ kind: "nudge", title: "Evening check-in", body: event.message });
      refresh();
    } else if (event.type === "mail_matches") {
      const body = `${event.count} new ${event.count === 1 ? "email" : "emails"} from recruiters. See Today.`;
      showNotification("Job-Copilot", body);
      push({ kind: "reminder", title: "Recruiter replied", body });
      refresh();
    } else if (event.type === "data_changed") {
      refresh();
    }
  });

  /** After an application moved to Interview: offer a prep guide, unless it already has one. */
  async function offerPrepGuide(id) {
    try {
      const { prepGuide } = await getJson(`/applications/${id}`);
      if (!prepGuide) setPrepOfferId(id);
    } catch {
      // the offer is a convenience; the drawer has the same button
    }
  }

  function focusChat() {
    setChatOpen(true);
    // The panel may only just be opening; wait for it to be on the page.
    setTimeout(() => document.getElementById("chat-input")?.focus(), 50);
  }

  function writeJournal() {
    setView("journal");
    setTimeout(() => document.getElementById("journal-input")?.focus(), 50);
  }

  /** After a form saved something: close it, reload, and say what happened. */
  function saved(title, body) {
    closeDialog();
    refresh();
    onNotice(title, body);
  }

  const commands = [
    ...VIEWS.map((item) => ({ id: `go-${item.id}`, label: `Go to ${item.label}`, icon: item.icon, shortcut: item.key, run: () => setView(item.id) })),
    { id: "new-application", label: "New application", icon: Plus, shortcut: "N", run: () => setDialog("application") },
    { id: "new-reminder", label: "New reminder", icon: Bell, shortcut: "R", run: () => setDialog("reminder") },
    { id: "new-topic", label: "Log study session", icon: BookOpen, shortcut: "S", run: () => setDialog("topic") },
    { id: "journal-line", label: "Add to today's journal", icon: NotebookPen, shortcut: "J", run: writeJournal },
    { id: "chat", label: "Write to the assistant", icon: PanelRight, shortcut: "/", run: focusChat },
    { id: "theme", label: theme.dark ? "Switch to light mode" : "Switch to dark mode", icon: theme.dark ? Sun : Moon, run: theme.toggle },
    { id: "shortcuts", label: "Keyboard shortcuts", icon: Keyboard, shortcut: "?", run: () => setDialog("shortcuts") },
  ];

  useShortcuts({
    "mod+k": () => setDialog((current) => (current === "commands" ? null : "commands")),
    ...Object.fromEntries(VIEWS.map((item) => [item.key, () => setView(item.id)])),
    "/": focusChat,
    a: () => setChatOpen((open) => !open),
    n: () => setDialog("application"),
    r: () => setDialog("reminder"),
    s: () => setDialog("topic"),
    j: writeJournal,
    "?": () => setDialog("shortcuts"),
  });

  return (
    <div className="flex h-dvh bg-canvas text-ink">
      <Sidebar
        view={view.id}
        onNavigate={setView}
        dueCount={today.data?.due.length ?? 0}
        theme={theme}
        name={profile.data?.settings.name || profile.data?.defaults.name || ""}
        onShowShortcuts={() => setDialog("shortcuts")}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <PageHeader
          title={view.label}
          subtitle={view.id === "today" && today.data ? formatLongDate(today.data.date) : null}
          chatOpen={chatOpen}
          onToggleChat={() => setChatOpen((open) => !open)}
          onOpenCommands={() => setDialog("commands")}
          action={
            action && (
              <Button variant="primary" size="md" onClick={() => setDialog(action.dialog)}>
                <Plus className="size-4" aria-hidden />
                <span className="hidden sm:inline">{action.label}</span>
              </Button>
            )
          }
        />
        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-5xl px-4 py-6 sm:px-8">
            <Active
              refreshKey={refreshKey}
              onError={onError}
              onNotice={onNotice}
              onChanged={refresh}
              onOpen={setApplicationId}
              onInterview={offerPrepGuide}
            />
          </div>
        </main>
        <MobileNav view={view.id} onNavigate={setView} dueCount={today.data?.due.length ?? 0} />
      </div>

      {chatOpen && <ChatPanel chat={chat} onClose={() => setChatOpen(false)} />}

      {applicationId && (
        <ApplicationDrawer
          id={applicationId}
          refreshKey={refreshKey}
          onClose={() => setApplicationId(null)}
          onChanged={refresh}
          onError={onError}
          onNotice={onNotice}
          onInterview={offerPrepGuide}
        />
      )}

      {prepOfferId && (
        <PrepOfferDialog
          applicationId={prepOfferId}
          onClose={() => setPrepOfferId(null)}
          onCreated={(id) => {
            setPrepOfferId(null);
            refresh();
            setApplicationId(id);
            setTimeout(() => document.getElementById("prep-guide")?.scrollIntoView({ behavior: "smooth" }), 300);
          }}
        />
      )}

      {dialog === "application" && (
        <NewApplicationDialog
          onClose={closeDialog}
          onCreated={({ application, created }) =>
            saved(created ? "Application added" : "Already tracking this one", describeApplication(application))
          }
        />
      )}
      {dialog === "reminder" && <NewReminderDialog onClose={closeDialog} onCreated={({ reminder }) => saved("Reminder added", reminder.message)} />}
      {dialog === "topic" && (
        <NewTopicDialog
          onClose={closeDialog}
          onCreated={({ topic, scheduled }) => saved("Study session logged", scheduled ? `Revisions scheduled for ${topic.name}` : topic.name)}
        />
      )}
      {dialog === "commands" && <CommandMenu commands={commands} onOpenApplication={setApplicationId} onClose={closeDialog} />}
      {dialog === "shortcuts" && <ShortcutsDialog onClose={closeDialog} />}

      <Toasts toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
