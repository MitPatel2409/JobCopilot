import { useState } from "react";
import { Bell, BellOff, BellRing, Keyboard, Moon, Sun } from "lucide-react";
import { notificationsSupported } from "../utils/notify";
import { VIEWS } from "../utils/views";

const ITEM = "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm";

/** Left navigation. Shows icons only on medium screens and is replaced by MobileNav on phones. */
export default function Sidebar({ view, onNavigate, dueCount, theme, name, onShowShortcuts }) {
  return (
    <aside className="hidden w-14 shrink-0 flex-col border-r border-line bg-surface md:flex xl:w-52">
      <div className="flex h-14 items-center gap-2.5 border-b border-line px-4">
        <span className="flex size-6 shrink-0 items-center justify-center rounded bg-accent text-xs font-bold text-accent-fg" aria-hidden>
          J
        </span>
        <span className="hidden text-sm font-semibold text-ink xl:inline">Job-Copilot</span>
      </div>

      <nav className="flex-1 space-y-0.5 p-2" aria-label="Main">
        {VIEWS.filter(({ id }) => id !== "settings").map(({ id, label, icon, key }) => {
          const Icon = icon;
          const active = view === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onNavigate(id)}
              aria-current={active ? "page" : undefined}
              title={`${label} (${key})`}
              className={`${ITEM} relative ${active ? "bg-sunken font-medium text-ink" : "text-muted hover:bg-sunken hover:text-ink"}`}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              <span className="hidden flex-1 text-left xl:inline">{label}</span>
              {id === "today" && dueCount > 0 && (
                <>
                  <span className="hidden text-xs tabular-nums text-muted xl:inline">{dueCount}</span>
                  <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-danger xl:hidden" aria-label={`${dueCount} due`} />
                </>
              )}
            </button>
          );
        })}
      </nav>

      <div className="space-y-0.5 border-t border-line p-2">
        <NotificationsButton />
        <button type="button" onClick={theme.toggle} title="Switch theme" className={`${ITEM} text-muted hover:bg-sunken hover:text-ink`}>
          {theme.dark ? <Sun className="size-4 shrink-0" aria-hidden /> : <Moon className="size-4 shrink-0" aria-hidden />}
          <span className="hidden xl:inline">{theme.dark ? "Light mode" : "Dark mode"}</span>
        </button>
        <button type="button" onClick={onShowShortcuts} title="Keyboard shortcuts (?)" className={`${ITEM} text-muted hover:bg-sunken hover:text-ink`}>
          <Keyboard className="size-4 shrink-0" aria-hidden />
          <span className="hidden xl:inline">Shortcuts</span>
        </button>
        <button
          type="button"
          onClick={() => onNavigate("settings")}
          aria-current={view === "settings" ? "page" : undefined}
          title="Settings (6)"
          className={`${ITEM} mt-1 ${view === "settings" ? "bg-sunken text-ink" : "text-muted hover:bg-sunken hover:text-ink"}`}
        >
          <Avatar name={name} />
          <span className="hidden min-w-0 flex-1 text-left xl:block">
            <span className="block truncate text-sm font-medium text-ink">{name || "Settings"}</span>
            {name && <span className="block truncate text-xs text-muted">Settings</span>}
          </span>
        </button>
      </div>
    </aside>
  );
}

function Avatar({ name }) {
  const initial = name.trim()[0]?.toUpperCase() ?? "?";
  return (
    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-sunken text-[11px] font-semibold text-ink-soft ring-1 ring-line-strong" aria-hidden>
      {initial}
    </span>
  );
}

/** Desktop notifications need the browser's permission once. */
function NotificationsButton() {
  const [permission, setPermission] = useState(() => (notificationsSupported() ? Notification.permission : "unsupported"));

  if (permission === "unsupported") return null;
  if (permission === "default") {
    return (
      <button
        type="button"
        onClick={async () => setPermission(await Notification.requestPermission())}
        title="Turn on desktop reminders"
        className={`${ITEM} text-ink-soft hover:bg-sunken`}
      >
        <BellRing className="size-4 shrink-0" aria-hidden />
        <span className="hidden xl:inline">Turn on reminders</span>
      </button>
    );
  }

  const granted = permission === "granted";
  const Icon = granted ? Bell : BellOff;
  const text = granted ? "Reminders on" : "Notifications blocked";
  return (
    <p className={`${ITEM} text-muted`} title={granted ? text : "Allow notifications for this site in your browser settings"}>
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="hidden xl:inline">{text}</span>
    </p>
  );
}
