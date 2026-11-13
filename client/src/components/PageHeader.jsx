import { PanelRight, Search } from "lucide-react";
import { IconButton, Kbd } from "./ui";

/** The bar above every view: its title, the command menu, the view's main action and the assistant toggle. */
export default function PageHeader({ title, subtitle, action, chatOpen, onToggleChat, onOpenCommands }) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface px-4 sm:px-6">
      <div className="flex min-w-0 flex-1 items-baseline gap-2">
        <h1 className="truncate text-sm font-semibold text-ink">{title}</h1>
        {subtitle && <span className="hidden truncate text-sm text-muted sm:inline">{subtitle}</span>}
      </div>

      <button
        type="button"
        onClick={onOpenCommands}
        className="hidden items-center gap-2 rounded-md border border-line-strong bg-surface py-1 pl-2.5 pr-1.5 text-xs text-muted hover:bg-sunken sm:inline-flex"
      >
        <Search className="size-3.5" aria-hidden /> Search or run a command
        <Kbd>Ctrl K</Kbd>
      </button>
      <IconButton label="Search or run a command" onClick={onOpenCommands} className="sm:hidden">
        <Search className="size-4" aria-hidden />
      </IconButton>

      {action}

      <IconButton
        label={chatOpen ? "Hide assistant (A)" : "Show assistant (A)"}
        aria-pressed={chatOpen}
        onClick={onToggleChat}
        className={chatOpen ? "bg-sunken text-ink" : ""}
      >
        <PanelRight className="size-4" aria-hidden />
      </IconButton>
    </header>
  );
}
